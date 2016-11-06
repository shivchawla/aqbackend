'use strict';

const Backtest = require('./BacktestService');

module.exports.createBacktest = function createBacktest (req, res, next) {
    Backtest.createBacktest(req.swagger.params, res, next);
};

module.exports.getBackTests = function getBackTests (req, res, next) {
    Backtest.getBackTests(req.swagger.params, res, next);
};
