/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:44:53
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-28 10:38:29
*/

'use strict';
const Stock = require('../Marketplace/StockService');

module.exports.getStockDetail = function getStockDetail(req, res, next) {
    Stock.getStockDetail(req.swagger.params, res, next);
};
