'use strict';
const StrategyModel = require('../models/strategy');
const BacktestService = require('./BacktestService');
const BacktestModel = require('../models/backtest');
var constants = require('../utils/Constants.js');
const Promise = require('bluebird');
var CryptoJS = require("crypto-js");
const config = require('config');

exports.createStrategy = function(args, res, next) {
    const user = args.user;
    const values = args.body.value;
    var encoded_code= CryptoJS.AES.encrypt(values.code, config.get('encoding_key'));
    const Strategy = {
        name: values.name,
        user: user._id,
        type: values.name,
        language: values.language,
        description: values.description,
        code: encoded_code,
        createdAt: new Date()
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
    const user = args.user;
    const id = args.id.value;
    const values = args.body.value;
    StrategyModel.fetchStrategy({
        user: user._id,
        _id: id
    })
    .then(strategy => {
        strategy.code = CryptoJS.AES.decrypt(strategy.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        BacktestService.createBacktest(strategy, values, res, next);
    });
};

exports.getStrategys = function(args, res, next) {
    const user = args.user;
    const query = {
        user: user._id
    };
    const fetchDeleted = false;
    if (args.search.value) {
        query.$or = [
            {
                name: {$regex: args.search.value, $options: 'i'}
            },
            {
                description: {$regex: args.search.value, $options: 'i'}
            }
        ];
    }
    StrategyModel.fetchStrategys(query)
    .then(strategy => {
        const strategies = [];
        strategy.forEach(str => {
            str.code = CryptoJS.AES.decrypt(str.code,config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
            strategies.push(str.toObject());
        });
        return Promise.map(strategies, function(str) {
            //const stra = str.toObject();
            return BacktestModel.findCount({
                strategy: str._id
            },fetchDeleted)
            .then(c => {
                str.backtests = c;
                return str;
            });
        });
    })
    .then(strata => {
        res.status(200).json(strata);
    })
    .catch(err => {
        next(err);
    });
};

exports.getStrategy = function(args, res, next) {
    const user = args.user;
    const id = args.id.value;
    StrategyModel.fetchStrategy({
        user: user._id,
        _id: id
    })
    .then(strategy => {
        strategy.code = CryptoJS.AES.decrypt(strategy.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        res.status(200).json(strategy);
    })
    .catch(err => {
        next(err);
    });
};

exports.updateStrategy = function(args, res, next) {
    const query = {
        _id: args.id.value
    };

     if(args.body.value && args.body.value.code){
        var str = args.body.value.code; 
        args.body.value.code = CryptoJS.AES.encrypt(str, config.get('encoding_key'));
    }

    StrategyModel.updateStrategy(query, args.body.value)
      .then(str => {
          res.status(200).json(str);
      })
      .catch(err => {
          next(err);
      });
};

exports.deleteStrategy = function (args, res, next) {
    const query = {
        _id: args.id.value
    };
    StrategyModel.deleteStrategy(query)
      .then(() => {
          BacktestModel.removeAllBack({
              strategy: query._id
          });
          res.status(200).json({id: args.id.value});
      })
      .catch(err => {
          next(err);
      });
};
