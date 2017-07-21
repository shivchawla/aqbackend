/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:44:53
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-07-05 15:42:19
*/

'use strict';
const Stock = require('./StockService');

module.exports.getStockDetail = function getStockDetail(req, res, next) {
    Stock.getStockDetail(req.swagger.params, res, next);
};
