/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 20:45:19
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-11 16:06:45
*/

'use strict';
const Investor = require('./InvestorService');

module.exports.createInvestor = function createInvestor(req, res, next) {
    Investor.createInvestor(req.swagger.params, res, next);
};

module.exports.getInvestor = function getInvestor(req, res, next) {
    Investor.getInvestor(req.swagger.params, res, next);
};

module.exports.getFollowingAdvisors = function getFollowingAdvisors(req, res, next) {
    Investor.getFollowingAdvisors(req.swagger.params, res, next);
};

module.exports.getFollowingAdvices = function getFollowingAdvices(req, res, next) {
    Investor.getFollowingAdvices(req.swagger.params, res, next);
};

//Investor Portfolio Related

module.exports.createInvestorPortfolio = function createInvestorPortfolio(req, res, next){
	Investor.createInvestorPortfolio(req.swagger.params, res, next);
};

module.exports.updateInvestorPortfolio = function updateInvestorPortfolio(req, res, next){
	Investor.updateInvestorPortfolio(req.swagger.params, res, next);
};

module.exports.deleteInvestorPortfolio = function deleteInvestorPortfolio(req, res, next){
	Investor.updateInvestorPortfolio(req.swagger.params, res, next);
};
