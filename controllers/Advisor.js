/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-21 11:22:32
*/

'use strict';
const Advisor = require('./AdvisorService');

module.exports.createAdvisor = function createAdvisor(req, res, next) {
    Advisor.createAdvisor(req.swagger.params, res, next);
};

module.exports.getAdvisors = function getAdvisors(req, res, next) {
    Advisor.getAdvisors(req.swagger.params, res, next);
};

module.exports.getAdvisorSummary = function getAdvisor(req, res, next) {
    Advisor.getAdvisorSummary(req.swagger.params, res, next);
};

module.exports.getAdvisorDetail = function getAdvisor(req, res, next) {
    Advisor.getAdvisorDetail(req.swagger.params, res, next);
};

module.exports.followAdvisor = function followAdvisor(req, res, next) {
    Advisor.followAdvisor(req.swagger.params, res, next);
};

module.exports.getFollowers = function getFollowers(req, res, next) {
    Advisor.getFollowers(req.swagger.params, res, next);
};
