/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 19:32:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-12 10:44:33
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Security = require('./Security');
const Advice = require('./Advice');

const DollarPosition = new Schema({
	security: Security,

	investment: {
		type: Number,
		required: true,
		default: 0.0,
	},

	//Not used unless used with real predictions
	quantity: {
		type: Number,
		default: 0,
	},

	avgPrice: Number,

	lastPrice: Number,

	totalFees: Number,

	dividendCash: Number

});

module.exports = DollarPosition;