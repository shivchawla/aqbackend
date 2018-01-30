/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 20:45:19
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-30 12:35:31
*/

'use strict';
const Investor = require('./Marketplace/InvestorService');

module.exports.createInvestor = function(req, res, next) {
    Investor.createInvestor(req.swagger.params, res, next);
};

module.exports.getInvestorSummary = function(req, res, next) {
    Investor.getInvestorSummary(req.swagger.params, res, next);
};

module.exports.getInvestorDetail = function(req, res, next) {
    Investor.getInvestorDetail(req.swagger.params, res, next);
};

module.exports.getFollowingAdvisors = function(req, res, next) {
    Investor.getFollowingAdvisors(req.swagger.params, res, next);
};

module.exports.getFollowingAdvices = function(req, res, next) {
    Investor.getFollowingAdvices(req.swagger.params, res, next);
};

//Investor Portfolio Related
module.exports.createInvestorPortfolio = function(req, res, next) {
	Investor.createInvestorPortfolio(req.swagger.params, res, next);
};

/*module.exports.createInvestorPortfolioFromTransactions = function(req, res, next) {
	Investor.createInvestorPortfolioFromTransactions(req.swagger.params, res, next);
};*/

module.exports.getInvestorPortfolios = function(req, res, next) {
	Investor.getInvestorPortfolios(req.swagger.params, res, next);
};

module.exports.getInvestorPortfolio = function(req, res, next) {
	Investor.getInvestorPortfolio(req.swagger.params, res, next);
};

module.exports.getInvestorPerformance = function(req, res, next) {
	Investor.getInvestorPerformance(req.swagger.params, res, next);
};

module.exports.updateInvestorPortfolio = function(req, res, next) {
	Investor.updateInvestorPortfolio(req.swagger.params, res, next);
};

module.exports.updateInvestorPortfolioForTransactions = function(req, res, next) {
	Investor.updateInvestorPortfolioForTransactions(req.swagger.params, res, next);
};

module.exports.deleteInvestorPortfolio = function(req, res, next) {
	Investor.deleteInvestorPortfolio(req.swagger.params, res, next);
};
