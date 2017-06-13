/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-06-13 10:31:44
*/

'use strict';
const Security = require('./Security')

const mongoose = require('./index');
const Schema = mongoose.Schema;

const Transaction = new Schema({
	security: Security,

	quantity: {
		type: Number,
		require: true,
		default: 0,
	},

	price: {
		type: Number,
	},

	direction: {
		type: String,
	},

	date: Date,
});

const TransactionModel = mongoose.model('Transaction', Transaction);
module.exports = TransactionModel;