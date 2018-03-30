/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:44:53
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-30 11:14:26
*/

'use strict';
const Stock = require('../Marketplace/StockService');

module.exports.getStockDetail = function(req, res, next) {
    Stock.getStockDetail(req.swagger.params, res, next);
};

module.exports.getStocks = function(req, res, next) {
    Stock.getStocks(req.swagger.params, res, next);
};

module.exports.updateStockWeight = function(req, res, next) {
    Stock.updateStockWeight(req.swagger.params, res, next);
};
