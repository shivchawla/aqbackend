/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-02 18:26:29
*/

'use strict';
const Advisor = require('./AdvisorService');

module.exports.createAdvisor = function createAdvisor(req, res, next) {
    Advisor.createAdvisor(req.swagger.params, res, next);
};

module.exports.getAdvisors = function getAdvisors(req, res, next) {
    Advisor.getAdvisors(req.swagger.params, res, next);
};

module.exports.getAdvisor = function getAdvisor(req, res, next) {
    Advisor.getAdvisor(req.swagger.params, res, next);
};

module.exports.followAdvisor = function followAdvisor(req, res, next) {
    Advisor.followAdvisor(req.swagger.params, res, next);
};

module.exports.getFollowers = function getFollowers(req, res, next) {
    Advisor.getFollowers(req.swagger.params, res, next);
};

module.exports.createAdvice = function createAdvice(req, res, next) {
    Advisor.createAdvice(req.swagger.params, res, next);
};

module.exports.getAdvices = function getAdvices(req, res, next) {
    Advisor.getAdvices(req.swagger.params, res, next);
};

module.exports.getAdvice = function getAdvice(req, res, next) {
    Advisor.getAdvice(req.swagger.params, res, next);
};

module.exports.getAdviceHistory = function getAdviceHistory(req, res, next) {
    Advisor.getAdviceHistory(req.swagger.params, res, next);
};

module.exports.updateAdvice = function updateAdvice(req, res, next) {
    Advisor.updateAdvice(req.swagger.params, res, next);
};

module.exports.followAdvice = function followAdvice(req, res, next) {
    Advisor.followAdvice(req.swagger.params, res, next);
};

module.exports.subscribeAdvice = function subscribeAdvice(req, res, next) {
    Advisor.subscribeAdvice(req.swagger.params, res, next);
};
