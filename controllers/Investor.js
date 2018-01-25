/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 20:45:19
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-23 11:44:46
*/

'use strict';
const Investor = require('./InvestorService');

module.exports.createInvestor = function createInvestor(req, res, next) {
    Investor.createInvestor(req.swagger.params, res, next);
};

module.exports.getInvestorSummary = function getInvestorSummary(req, res, next) {
    Investor.getInvestorSummary(req.swagger.params, res, next);
};

module.exports.getInvestorDetail = function getInvestorSummary(req, res, next) {
    Investor.getInvestorDetail(req.swagger.params, res, next);
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

module.exports.getInvestorPortfolios = function getInvestorPortfolios(req, res, next){
	Investor.getInvestorPortfolios(req.swagger.params, res, next);
};

module.exports.getInvestorPortfolio = function getInvestorPortfolio(req, res, next){
	Investor.getInvestorPortfolio(req.swagger.params, res, next);
};

module.exports.getInvestorPerformance = function getInvestorPerformance(req, res, next){
	Investor.getInvestorPerformance(req.swagger.params, res, next);
};

module.exports.updateInvestorPortfolio = function updateInvestorPortfolio(req, res, next){
	Investor.updateInvestorPortfolio(req.swagger.params, res, next);
};

module.exports.deleteInvestorPortfolio = function deleteInvestorPortfolio(req, res, next){
	Investor.deleteInvestorPortfolio(req.swagger.params, res, next);
};
