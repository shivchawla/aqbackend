/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:55
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-09-04 12:39:52
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const PortfolioStats  = new Schema({
    date: Date,
    netValue: Number,
});


module.exports = PortfolioStats;