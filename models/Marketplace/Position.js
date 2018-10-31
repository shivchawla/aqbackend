/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-31 12:37:36
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Security = require('./Security');
const Advice = require('./Advice');

const Position = new Schema({
	security: Security,

	investment: {
		type: Number,
		default: 0.0,
	},

	quantity: {
		type: Number,
		default: 0,
	},

	avgPrice: {
		type: Number,
		default: 0
	},

	lastPrice: {
		type: Number,
		default: 0
	},

	totalFees: Number,

	dividendCash: Number,

	//To track the orginating advice (if any)
	advice: {
		type: Schema.Types.ObjectId,
        ref: 'Advice', 
	},

});

module.exports = Position;