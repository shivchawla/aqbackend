'use strict';

const Backtest = require('../Research/BacktestService');

module.exports.getBackTests = function getBackTests (req, res, next) {
    Backtest.getBackTests(req.swagger.params, res, next);
};

module.exports.getBackTest = function getBackTest (req, res, next) {
    Backtest.getBackTest(req.swagger.params, res, next);
};

module.exports.deleteBackTest = function deleteBackTest (req, res, next) {
    Backtest.deleteBackTest(req.swagger.params, res, next);
};

module.exports.updateBacktest = function updateBacktest (req, res, next) {
    Backtest.updateBacktest(req.swagger.params, res, next);
};
