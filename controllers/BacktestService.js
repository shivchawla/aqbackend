'use strict';
const BacktestModel = require('../models/backtest');
const StrategyModel = require('../models/strategy');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const exec = require('../utils/spawn');
const uuid = require('node-uuid');

exports.createBacktest = function(strategy, values, res, next) {
    const fileName = uuid.v4() + '.js';
    fs.writeFileAsync(fileName, strategy.code, 'utf8')
      .then(() => {
          exec(fileName, function(err, data) {
              if (err) {
                  return Promise.reject(err);
              }
              const backtest = {
                  strategy: strategy._id,
                  start: values.date,
                  end: values.date,
                  capital: values.capital,
                  plan: values.plan,
                  code: strategy.code,
                  output: data
              };
              return BacktestModel.saveBacktest(backtest)
              .then(backtst => {
                  res.status(200).json(backtst);
              });
          });
      })
      .catch(err => {
          next(err);
      });
};

exports.getBackTests = function(args, res, next) {
    const user = args.user;
    const id = args.id.value;
    StrategyModel.fetchStrategy({
        user: user._id,
        _id: id
    })
    .then(strategy => {
        return BacktestModel.fetchBacktests({
            strategy: strategy._id
        });
    })
    .then(backtests => {
        res.status(200).json(backtests);
    })
    .catch(err => {
        next(err);
    });
};

exports.getBackTest = function(args, res, next) {
    const id = args.id.value;
    BacktestModel.fetchBacktest({
        _id: id
    })
    .then(bt => {
        res.status(200).json(bt);
    })
    .catch(err => {
        next(err);
    });
};

exports.deleteBackTest = function(args, res, next) {
    const id = args.id.value;
    BacktestModel.removeAllBack({
        _id: id
    })
    .then(() => {
        res.status(200).json({id: id});
    })
    .catch(err => {
        next(err);
    });
};

exports.shareBackTest = function(args, res, next) {
    const id = args.id.value;
    BacktestModel.fetchBacktest({
        _id: id
    })
    .then(bt => {
        return StrategyModel.fetchStrategy({
            name: 'Community'
        })
        .then(strat => {
            const strategy = strat.toObject();
            const backTest = bt.toObject();
            delete backTest._id;
            backTest.strategy = strategy._id;
            return BacktestModel.saveBacktest(backTest);
        })
        .then(bacTe => {
            res.status(200).json(bacTe);
        });
    })
    .catch(err => {
        next(err);
    });
};

exports.getCommunityBackTest = function(args, res, next) {
    StrategyModel.fetchStrategy({
        name: 'Community'
    })
    .then(strat => {
        const strategy = strat.toObject();
        return BacktestModel.fetchBacktests({
            strategy: strategy._id
        });
    })
    .then(data => {
        res.status(200).json(data);
    })
    .catch(err => {
        next(err);
    });
};
