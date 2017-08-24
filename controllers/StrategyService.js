'use strict';
const StrategyModel = require('../models/strategy');
const BacktestService = require('./BacktestService');
const BacktestModel = require('../models/backtest');
const ForwardtestModel = require('../models/forwardtest');
var constants = require('../utils/Constants.js');
const Promise = require('bluebird');
var CryptoJS = require("crypto-js");
const config = require('config');
var fs = require('fs');
var path = require("path");    
const fname = "../examples/template.txt";
const RedisUtils = require('../utils/RedisUtils');

exports.createStrategy = function(args, res, next) {
    const user = args.user;
    const values = args.body.value;
    var code = values.code;
    
    if(code=="") {   
        console.log(path.resolve(path.join(__dirname, fname)));
        code = fs.readFileSync(path.resolve(path.join(__dirname, fname)), 'utf8');
    }

    var encoded_code = CryptoJS.AES.encrypt(code, config.get('encoding_key'));
    const Strategy = {
        name: values.name,
        user: user._id,
        type: values.name,
        language: values.language,
        description: values.description,
        code: encoded_code,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    StrategyModel.saveStrategy(Strategy)
    .then(strategy => {
        strategy.code = CryptoJS.AES.decrypt(strategy.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        return res.status(200).json(strategy);
    })
    .catch(err => {
        next(err);

    });
};

exports.execStrategy = function(args, res, next) {
    const userId = args.user._id;
    const strategyId = args.strategyId.value;
    const values = args.body.value;
    const token  = args['aimsquant-token'].value.toString();   
    
    return new Promise(function(resolve, reject) {
        RedisUtils.getValue(token + '-request-queue', (err, data) => {
            if (data) {
                var queue = JSON.parse(data);
                if (queue.length >= config.get('max_num_julia_process_user')) {
                     return reject(new Error("Can't execute"));
                } 
            } 
            
            return resolve(true);
              
        });
    })
    .then(flag => {

        if(flag) {  
            return StrategyModel.fetchStrategy({
                    user: userId, _id: strategyId}, {});
        } 
    })
    .then(strategy => {
        BacktestService.createBacktest(strategy, values, res, next);
    })
    .catch(err => {
        res.status(400).json(err);
    });

};

exports.getStrategys = function(args, res, next) {
    const user = args.user;
    const query = {
        user: user._id
    };
    
    let hasSearchParam;
    //const fetchDeleted = false;
    if (args.search.value) {
        query.$or = [
            {
                name: {$regex: args.search.value, $options: 'i'}
            },
            {
                description: {$regex: args.search.value, $options: 'i'}
            }
        ];

        hasSearchParam = true;
    }

    const strategies = [];

    var p = { then: function(resolve) {
            return Promise.map(strategies, function(str) {
                return Promise.all([BacktestModel.findCount({
                    strategy: str._id,
                    deleted: false,
                }), ForwardtestModel.fetchForwardTests({
                    strategy: str._id,
                    deleted: false}, {select:'_id backtest createdAt updatedAt error active'})
                ])
                .then(([bc, ftests]) => {
                    
                    str.numBacktests = bc;
                    str.numForwardtests = ftests.length;
                    str.forwardtest = null;

                    if(str.numForwardtests == 1) {
                        str.forwardtest = ftests[0];    
                    } else if(str.numForwardtests > 1) {
                        console.log("Possible Error. Can't have more than one active forward test per strategy");
                    }
                     
                    return str;
                });
            })
            .then(strata => {
                return res.status(200).json(strata);
            })
            .catch(err => {
                next(err);
            });
        }
    };

    StrategyModel.fetchStrategys(query, args.sort.value)
    .then(strategy => {
        if(strategy.length > 0) {          
            strategy.forEach(str => {
                str.code = CryptoJS.AES.decrypt(str.code,config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
                strategies.push(str.toObject());
            });

            Promise.resolve(p);
            
        } else if (!hasSearchParam) {

            return Promise.all([
                StrategyModel.createStrategy(user, "Sample Strategy", "A quick tutorial", "sample.txt"),
                StrategyModel.createStrategy(user, "NIFTY-50 Stock Reversal", "Invest in least performing stocks based on 22 days returns", "reversal.txt"),
            ]).then(strs => {
                strs.forEach(str => {
                    str.code = CryptoJS.AES.decrypt(str.code,config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
                    strategies.push(str.toObject());
                });
                //str2.code = CryptoJS.AES.decrypt(str2.code,config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
                //strategies.push(str2.toObject());

                Promise.resolve(p);
            });

        } else {
            Promise.resolve(p);
        }
    });
};

exports.getStrategy = function(args, res, next) {
    const user = args.user;
    const strategyId = args.strategyId.value;

    Promise.all([StrategyModel.fetchStrategy({
                            user: user._id,
                            _id: strategyId
                        }, {}),  
                        BacktestModel.findCount({
                            strategy: strategyId,
                            deleted: false}),
                        ForwardtestModel.fetchForwardTests({
                            strategy: strategyId,
                            deleted: false}, {select:'_id backtest createdAt updatedAt error active'})
                    ])
    .then(([str, bc, ftests]) => {
        
        if(str) {
            var strategy = JSON.parse(JSON.stringify(str));
            
            strategy.numBacktests = bc;
            strategy.numForwardtests = ftests.length;
            strategy.forwardtest = null;

            if(strategy.numForwardtests == 1) {
                strategy.forwardtest = ftests[0];    
            } else if(strategy.numForwardtests > 1) {
                console.log("Possible Error. Can't have more than one active forward test per strategy");
            }
            
            if(str.code) { 
                strategy.code = CryptoJS.AES.decrypt(str.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
            }

            return strategy;
        } else {
            throw new Error("No Strategy Found");
        }
    })
    .then(str => {
        return res.status(200).json(str);
    })
    .catch(err => {
        return res.status(400).json(err.message);
        next(err);
    });
};

exports.updateStrategy = function(args, res, next) {
    const strategyId = args.strategyId.value;
    const userId = args.user._id;

    const query = {
        _id: strategyId,
        user: userId
    };

    if(args.body.value && args.body.value.code){
        var str = args.body.value.code;
        args.body.value.code = CryptoJS.AES.encrypt(str, config.get('encoding_key'));
    }

    StrategyModel.updateStrategy(query, args.body.value)
    .then(str => {
        return res.status(200).json(str);
    })
    .catch(err => {
        next(err);
    });
};

exports.deleteStrategy = function (args, res, next) {
    const strategyId = args.strategyId.value;
    const userId = args.user._id;

    const query = {
        _id: strategyId,
        user: userId
    };

    StrategyModel.deleteStrategy(query)
      .then(() => {
          return BacktestModel.removeAllBack({
              strategy: strategyId,
              shared : false});
      })
      .then(() => {    
          res.status(200).json({id: strategyId});
      })
      .catch(err => {
          next(err);
      });
};
