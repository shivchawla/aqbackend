'use strict';
const BacktestModel = require('../models/backtest');
const StrategyModel = require('../models/strategy');
exports.createBacktest = function(strategy, values, res, next) {
    const backtest = {
        strategy: strategy._id,
        start: values.date,
        end: values.date,
        capital: values.capital,
        plan: values.plan,
        code: strategy.code
    };
    BacktestModel.saveBacktest(backtest)
      .then(backtst => {
          res.status(200).json(backtst);
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
