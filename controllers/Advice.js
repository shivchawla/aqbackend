/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 14:59:47
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-04 16:21:16
*/

'use strict';
const Advice = require('./AdviceService');

module.exports.createAdvice = function createAdvice(req, res, next) {
    Advice.createAdvice(req.swagger.params, res, next);
};

module.exports.getAdvices = function getAdvices(req, res, next) {
    Advice.getAdvices(req.swagger.params, res, next);
};

module.exports.getAdvice = function getAdvice(req, res, next) {
    Advice.getAdvice(req.swagger.params, res, next);
};

module.exports.getAdviceHistory = function getAdviceHistory(req, res, next) {
    Advice.getAdviceHistory(req.swagger.params, res, next);
};

module.exports.updateAdvice = function updateAdvice(req, res, next) {
    Advice.updateAdvice(req.swagger.params, res, next);
};

module.exports.deleteAdvice = function deleteAdvice(req, res, next) {
    Advice.deleteAdvice(req.swagger.params, res, next);
};

module.exports.followAdvice = function followAdvice(req, res, next) {
    Advice.followAdvice(req.swagger.params, res, next);
};

module.exports.subscribeAdvice = function subscribeAdvice(req, res, next) {
    Advice.subscribeAdvice(req.swagger.params, res, next);
};
