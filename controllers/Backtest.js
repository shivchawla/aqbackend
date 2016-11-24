'use strict';

const Backtest = require('./BacktestService');

module.exports.createBacktest = function createBacktest (req, res, next) {
    Backtest.createBacktest(req.swagger.params, res, next);
};

module.exports.getBackTests = function getBackTests (req, res, next) {
    Backtest.getBackTests(req.swagger.params, res, next);
};

module.exports.getBackTest = function getBackTest (req, res, next) {
    Backtest.getBackTest(req.swagger.params, res, next);
};

module.exports.deleteBackTest = function deleteBackTest (req, res, next) {
    Backtest.deleteBackTest(req.swagger.params, res, next);
};

module.exports.shareBackTest = function shareBackTest(req, res, next) {
    Backtest.shareBackTest(req.swagger.params, res, next);
};

module.exports.getCommunityBackTest = function getCommunityBackTest(req, res, next) {
    Backtest.getCommunityBackTest(req.swagger.params, res, next);
}
