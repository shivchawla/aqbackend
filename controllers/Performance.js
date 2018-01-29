/*
* @Author: Shiv Chawla
* @Date:   2018-01-23 19:00:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-27 11:55:45
*/

'use strict';
const Performance = require('./MarketPlace/PerformanceService');

module.exports.getPerformanceInvestorPortfolio = function(req, res, next) {
    Performance.getPerformanceInvestorPortfolio(req.swagger.params, res, next);
};

module.exports.getPerformanceAdvicePortfolio = function(req, res, next) {
	Performance.getPerformanceAdvicePortfolio(req.swagger.params, res, next);
};

module.exports.getPerformanceNewPortfolio = function(req, res, next) {
    Performance.getPerformanceNewPortfolio(req.swagger.params, res, next);
};
