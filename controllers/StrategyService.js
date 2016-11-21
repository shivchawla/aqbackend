'use strict';
const StrategyModel = require('../models/strategy');
const BacktestService = require('./BacktestService');
const BacktestModel = require('../models/backtest');
const Promise = require('bluebird');

exports.createStrategy = function(args, res, next) {
    const user = args.user;
    const values = args.body.value;
    const Strategy = {
        name: values.name,
        user: user._id,
        type: values.name,
        language: values.language,
        description: values.description,
        code: values.code,
        createdAt: new Date()
    };
    StrategyModel.saveStrategy(Strategy)
        .then(strategy => {
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
        BacktestService.createBacktest(strategy, values, res, next);
    });
};

exports.getStrategys = function(args, res, next) {
    const user = args.user;
    const query = {
        user: user._id
    };
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
            strategies.push(str.toObject());
        });
        return Promise.map(strategies, function(str) {
            //const stra = str.toObject();
            return BacktestModel.findCount({
                strategy: str._id
            })
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
          res.status(200).json({message: 'deleted'});
      })
      .catch(err => {
          next(err);
      });
};
