/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 14:59:47
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-12-18 21:35:40
*/

'use strict';
const Advice = require('./AdviceService');

module.exports.createAdvice = function createAdvice(req, res, next) {
    Advice.createAdvice(req.swagger.params, res, next);
};

module.exports.getAdvices = function getAdvices(req, res, next) {
    Advice.getAdvices(req.swagger.params, res, next);
};

module.exports.getAdviceSummary = function getAdvice(req, res, next) {
    Advice.getAdviceSummary(req.swagger.params, res, next);
};

module.exports.getAdviceDetail = function getAdvice(req, res, next) {
    Advice.getAdviceDetail(req.swagger.params, res, next);
};

module.exports.getAdviceHistory = function getAdviceHistory(req, res, next) {
    Advice.getAdviceHistory(req.swagger.params, res, next);
};

module.exports.updateAdvice = function updateAdvice(req, res, next) {
    Advice.updateAdvice(req.swagger.params, res, next);
};

module.exports.updateAdvicePortfolio = function updateAdvicePortfolio(req, res, next) {
    Advice.updateAdvicePortfolio(req.swagger.params, res, next);
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
