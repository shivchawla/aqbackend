/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 15:35:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-22 12:41:14
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

const PerformanceMetrics  = new Schema({
	date: Date,
	performance: Schema.Types.Mixed,
	rating: Number,
});

const PortfolioStats  = new Schema({
	date: Date,
	netValue: Number,
});

module.exports = PerformanceMetrics;
module.exports = PortfolioStats;

