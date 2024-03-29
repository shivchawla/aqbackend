/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 14:59:47
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-08-10 16:07:55
*/

'use strict';
const Advice = require('../Marketplace/AdviceService');

module.exports.createAdvice = function(req, res, next) {
    Advice.createAdvice(req.swagger.params, res, next);
};

module.exports.validateAdvice = function(req, res, next) {
    Advice.validateAdvice(req.swagger.params, res, next);
};

module.exports.getAdvices = function(req, res, next) {
    Advice.getAdvices(req.swagger.params, res, next);
};

module.exports.getAdvicesDefault = function(req, res, next) {
    Advice.getAdvices(req.swagger.params, res, next);
};

module.exports.getAdviceSummary = function(req, res, next) {
    Advice.getAdviceSummary(req.swagger.params, res, next);
};

module.exports.getAdviceSummary_notoken = function(req, res, next) {
    Advice.getAdviceSummary(req.swagger.params, res, next);
};

module.exports.getAdviceDetail = function(req, res, next) {
    Advice.getAdviceDetail(req.swagger.params, res, next);
};

module.exports.getAdvicePortfolio = function(req, res, next) {
    Advice.getAdvicePortfolio(req.swagger.params, res, next);
};

module.exports.getAdviceHistory = function(req, res, next) {
    Advice.getAdviceHistory(req.swagger.params, res, next);
};

module.exports.updateAdvice = function(req, res, next) {
    Advice.updateAdvice(req.swagger.params, res, next);
};

module.exports.deleteAdvice = function(req, res, next) {
    Advice.deleteAdvice(req.swagger.params, res, next);
};

module.exports.publishAdvice = function(req, res, next) {
    Advice.publishAdvice(req.swagger.params, res, next);
};

module.exports.followAdvice = function(req, res, next) {
    Advice.followAdvice(req.swagger.params, res, next);
};

module.exports.subscribeAdvice = function(req, res, next) {
    Advice.subscribeAdvice(req.swagger.params, res, next);
};

module.exports.approveAdvice = function(req, res, next) {
    Advice.approveAdvice(req.swagger.params, res, next);
};

module.exports.approveAdviceNew = function(req, res, next) {
    Advice.approveAdviceNew(req.swagger.params, res, next);
}

module.exports.requestApproveAdvice = function(req, res, next) {
    Advice.requestApproveAdvice(req.swagger.params, res, next);
};
