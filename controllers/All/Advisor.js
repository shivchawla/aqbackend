/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-08 12:48:53
*/

'use strict';
const Advisor = require('../Marketplace/AdvisorService');

module.exports.createAdvisor = function(req, res, next) {
    Advisor.createAdvisor(req.swagger.params, res, next);
};

module.exports.allocateAdvisor = function(req, res, next) {
    Advisor.allocateAdvisor(req.swagger.params, res, next);
};

module.exports.updateAdvisorAllocationAmount = function(req, res, next) {
    Advisor.updateAdvisorAllocationAmount(req.swagger.params, res, next);
};

module.exports.updateAdvisorAllocationStatus = function(req, res, next) {
    Advisor.updateAdvisorAllocationStatus(req.swagger.params, res, next);
};

module.exports.getAdvisors = function(req, res, next) {
    Advisor.getAdvisors(req.swagger.params, res, next);
};

module.exports.getAdvisorSummary = function(req, res, next) {
    Advisor.getAdvisorSummary(req.swagger.params, res, next);
};

module.exports.followAdvisor = function(req, res, next) {
    Advisor.followAdvisor(req.swagger.params, res, next);
};

module.exports.getFollowers = function(req, res, next) {
    Advisor.getFollowers(req.swagger.params, res, next);
};

module.exports.updateAdvisorProfile = function(req, res, next) {
    Advisor.updateAdvisorProfile(req.swagger.params, res, next);
};

module.exports.approveAdvisor = function(req, res, next) {
    Advisor.approveAdvisor(req.swagger.params, res, next);
};

module.exports.fetchAdvisorByName = function(req, res, next) {
    Advisor.fetchAdvisorByName(req.swagger.params, res, next);
};

module.exports.getAdvisorsWithAllocation = function(req, res, next) {
    Advisor.getAdvisorsWithAllocation(req.swagger.params, res, next);
};

module.exports.getAdvisorAllocation = function(req, res, next) {
    Advisor.getAdvisorAllocation(req.swagger.params, res, next);
};

module.exports.addNotAllowedStock = function(req, res, next) {
    Advisor.addNotAllowedStock(req.swagger.params, res, next);
};

module.exports.updateAutomatedFlag = function(req, res, next) {
    Advisor.updateAutomatedFlag(req.swagger.params, res, next);
};