/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 20:45:19
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-02 11:38:49
*/

'use strict';
const Investor = require('./InvestorService');

module.exports.createInvestor = function createInvestor(req, res, next) {
    Investor.createInvestor(req.swagger.params, res, next);
};

module.exports.getInvestors = function getInvestors(req, res, next) {
    Investor.getInvestors(req.swagger.params, res, next);
};

module.exports.getInvestor = function getInvestor(req, res, next) {
    Investor.getInvestor(req.swagger.params, res, next);
};

module.exports.followInvestor = function followInvestor(req, res, next) {
    Investor.followInvestor(req.swagger.params, res, next);
};

module.exports.getFollowers = function getFollowers(req, res, next) {
    Investor.getFollowers(req.swagger.params, res, next);
};

module.exports.getFollowingAdvisors = function getFollowingAdvisors(req, res, next) {
    Investor.getFollowingAdvisors(req.swagger.params, res, next);
};

module.exports.getFollowingAdvices = function getFollowingAdvices(req, res, next) {
    Investor.getFollowingAdvices(req.swagger.params, res, next);
};

module.exports.followAdvice = function followAdvice(req, res, next) {
    Investor.followAdvice(req.swagger.params, res, next);
};

module.exports.subscribeAdvice = function subscribeAdvice(req, res, next) {
    Investor.subscribeAdvice(req.swagger.params, res, next);
};
