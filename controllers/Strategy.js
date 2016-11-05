'use strict';

const Strategy = require('./StrategyService');

module.exports.createStrategy = function createStrategy (req, res, next) {
    Strategy.createStrategy(req.swagger.params, res, next);
};

module.exports.execStrategy = function execStrategy (req, res, next) {
    Strategy.execStrategy(req.swagger.params, res, next);
};

module.exports.getBackTests = function getBackTests (req, res, next) {
    Strategy.getBackTests(req.swagger.params, res, next);
};

module.exports.getStrategys = function getStrategys (req, res, next) {
    Strategy.getStrategys(req.swagger.params, res, next);
};

module.exports.getStrategy = function getStrategy (req, res, next) {
    Strategy.getStrategy(req.swagger.params, res, next);
};

module.exports.updateStrategy = function updateStrategy (req, res, next) {
    Strategy.updateStrategy(req.swagger.params, res, next);
};
