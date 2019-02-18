'use strict';
const Promise = require('bluebird');
var CryptoJS = require("crypto-js");
const config = require('config');
var fs = require('fs');
var path = require("path");    
const fname = "../../examples/template.txt";
const _ = require('lodash');

const StrategyModel = require('../../models/Research/strategy');
const BacktestService = require('./BacktestService');
const BacktestModel = require('../../models/Research/backtest');
const ForwardtestModel = require('../../models/Research/forwardtest');
const BacktestHelper = require('../helpers/Backtest');

const defaultStrategy1 = {
    description: "Breakout strategy 1 - SMA crosses the upper bollinger band",
    entryConditions: {
        indicator1: {
            name:"SMA",
            params:{horizon: 10}
        },
        indicator2:{
            name: "UBB",
            params: {horizon: 50, width: 1.5}

        },
        name: "c1",
        operator: "CA"
    },

    entryLogic: "c1",
    language:"julia",
    name: "SMA/Bollinger crossover",
    tradeDirection:"BUY",
    type: "GUI"
};

const defaultStrategy2 = {
    description: "Breakout strategy 2 - Short term EMA crosses long term EMA",
    entryConditions: {
        indicator1: {
            name:"EMA",
            params:{horizon: 10, wilder: false}
        },
        indicator2:{
            name: "EMA",
            params: {horizon: 50, wilder: false}

        },
        name: "c1",
        operator: "CA"
    },

    entryLogic: "c1",
    language:"julia",
    name: "EMA crossover",
    tradeDirection:"BUY",
    type: "GUI"
};

exports.createStrategy = function(args, res, next) {
    const userId = _.get(args, 'user._id', null);
    const body = _.get(args, 'body.value', null);
    var code = _.get(body, 'code', "");
    var type = _.get(body, 'type', "GUI");
    var tradeDirection = _.get(body, 'tradeDirection', '');
 
    if(code=="" && type == "CODE") {   
        console.log(path.resolve(path.join(__dirname, fname)));
        code = fs.readFileSync(path.resolve(path.join(__dirname, fname)), 'utf8');
    }

    var encoded_code = CryptoJS.AES.encrypt(code, config.get('encoding_key'));
    
    const strategy = {
        name: _.get(body, 'name', "Sample Strategy").trim(),
        user: userId,
        type,
        tradeDirection, //only useful/relevant for GUI strategies
        description: _.get(body, 'description', ""),
        code: encoded_code,
        entryConditions: _.get(body, "entryConditions", []),
        exitConditions: _.get(body, "exitConditions", []),
        entryLogic: _.get(body, "entryLogic", ""),
        exitLogic: _.get(body, "exitLogic", ""),
        createdAt: new Date(),
        updatedAt: new Date()
    };

    return StrategyModel.fetchStrategys({name: strategy.name, user:userId})
    .then(strategies => {
        if(strategies.length > 0) {
            strategy.suffix = Math.max.apply(null, strategies.map(item => item.suffix)) + 1;
            strategy.fullName = strategy.name + `(${strategy.suffix})`;
        } else {
            strategy.fullName = strategy.name;
        }

        return StrategyModel.saveStrategy(strategy)
    })
    .then(str => {
        str.code = CryptoJS.AES.decrypt(str.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        return res.status(200).json(str);
    })
    .catch(err => {
        next(err);

    });
};

exports.execStrategy = function(args, res, next) {
    const userId = args.user._id;
    const strategyId = args.strategyId.value;
    const settings = args.body.value;

    return BacktestHelper.isBacktestCapacityAvailable(userId)
    .then(available => {
        if (available) {
            return StrategyModel.fetchStrategy({user: userId, _id: strategyId}, {})
        } else {
            throw new Error("Limit Exceeded");
        }
    })
    .then(strategy => {
        return BacktestService.createBacktest(strategy, settings, res, next);
    })
    .catch(err => {
        res.status(400).send(err.message);
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
                StrategyModel.createStrategy({...defaultStrategy1, user, fname: "SMAcrossover.txt"}),
                StrategyModel.createStrategy({...defaultStrategy2, user, fname: "EMAcrossover.txt"}),
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
                            _id: strategyId}, {}),  
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
                var code = CryptoJS.AES.decrypt(str.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
                
                //TEMPORARY adjustment to code written in previous version of API
                code = code.replace("using Raftaar", "");
                code = code.replace("Portofolio value", "Portfolio Value");
                
                if(strategy.name == "Sample Strategy") {
                    code = code.replace("CNX_BANK", "TCS");
                }

                if(strategy.name == "NIFTY-50 Stock Reversal") {
                    code = code.replace("state.portfolio", "state.account.portfolio");
                }
            }

            strategy.code = code;

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
    const strategyId = _.get(args,'strategyId.value', null);
    const userId = _.get(args, 'user._id', null);

    const query = {
        _id: strategyId,
        user: userId
    };

    const updates = _.get(args, 'body.value', {});

    if(_.get(updates, 'code', null)) {
        var str = _.get(updates, 'code', "");
        updates.code = CryptoJS.AES.encrypt(str, config.get('encoding_key'));
    }
    
    return Promise.all([StrategyModel.fetchStrategy(query, {}), StrategyModel.fetchStrategys({name: updates.name, user:userId}, null)])
    .then(([strategy, strategies]) => {

        if(strategy.name != updates.name) {
            if(strategies.length > 0) {
                var n = strategies.length + 1;
                updates.suffix = `(${n})`;
                updates.fullName = updates.name + updates.suffix;
            } else {
                updates.fullName = updates.name;
            }
        }

        return updates;
    })
    .then(updates => {
        return StrategyModel.updateStrategy(query, updates)
    })
    .then(str => {
        return res.status(200).json(str);
    })
    .catch(err => {
        return res.status(400).send(err.message);  
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

    Promise.all([BacktestModel.findCount({strategy: strategyId, shared: true}),
                    ForwardtestModel.findCount({strategy: strategyId})])
    .then(([numBacktests, numForwardtests]) => { 
        if(numForwardtests>0 || numBacktests>0) {
            return Promise.all([
                StrategyModel.updateStrategy(query, {deleted:true}),
                BacktestModel.removeAllBack({
                strategy: strategyId,
                shared : false})]);
        } else {
            return Promise.all([
                StrategyModel.deleteStrategy(query),
                BacktestModel.removeAllBack({
                strategy: strategyId,
                shared : false})]); 
        }
    })
    .then(([]) => {
        res.status(200).json({id: strategyId, msg: "Successfully Deleted"});
    })
    .catch(err => {
        res.status(400).json({id: strategyId, msg: err.message});
        next(err);
    });
};
