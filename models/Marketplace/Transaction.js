/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-29 22:09:30
*/

'use strict';
const Security = require('./Security');
const Portfolio = require('./Portfolio');

const mongoose = require('../index');
const Schema = mongoose.Schema;

const Transaction = new Schema({
	
	security: Security,

	quantity: {
		type: Number,
		required: true,
		default: 0,
	},

	price: {
		type: Number,
	},

	direction: {
		type: String,
	},

	date: Date,

	commission: {
		type: Number,
		default: 0.0
	},

	cashLinked: {
		type: Boolean,
		default: false
	},

	advice: Schema.Types.ObjectId
});

//const TransactionModel = mongoose.model('Transaction', Transaction);
module.exports = Transaction;