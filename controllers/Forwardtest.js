'use strict';

const ForwardTest = require('./ForwardtestService');

module.exports.createForwardtest = function createForwardtest (req, res, next) {
    ForwardTest.createForwardtest(req.swagger.params, res, next);
};
module.exports.getForwardTests = function getForwardTests (req, res, next) {
    ForwardTest.getForwardTests(req.swagger.params, res, next);
};

module.exports.getForwardTest = function getForwardTest (req, res, next) {
    ForwardTest.getForwardTest(req.swagger.params, res, next);
};

module.exports.deleteForwardTest = function deleteForwardTest (req, res, next) {
    ForwardTest.deleteForwardTest(req.swagger.params, res, next);
};

module.exports.updateForwardTest = function updateForwardTest (req, res, next) {
    ForwardTest.updateForwardTest(req.swagger.params, res, next);
};
