/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 14:59:47
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-11 13:12:58
*/

'use strict';
const Portfolio = require('./PortfolioService');

module.exports.createPortfolio = function createPortfolio(req, res, next) {
    Portfolio.createPortfolio(req.swagger.params, res, next);
};

module.exports.getPortfolio = function getPortfolio(req, res, next) {
    Portfolio.getPortfolio(req.swagger.params, res, next);
};

module.exports.getPositionDetail = function getPositionDetail(req, res, next) {
    Portfolio.getPositionDetail(req.swagger.params, res, next);
};

module.exports.updatePortfolio = function updatePortfolio(req, res, next) {
    Portfolio.updatePortfolio(req.swagger.params, res, next);
};

module.exports.addPosition = function addPosition(req, res, next) {
    Portfolio.addPosition(req.swagger.params, res, next);
};

module.exports.updatePosition = function updatePosition(req, res, next) {
    Portfolio.updatePosition(req.swagger.params, res, next);
};

module.exports.deletePortfolio = function deletePortfolio(req, res, next) {
    Portfolio.deletePortfolio(req.swagger.params, res, next);
};
