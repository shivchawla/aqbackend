/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-22 16:16:29
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

const Security = require('./Security');

const Position = new Schema({
	security: Security,

	quantity: {
		type: Number,
		require: true,
		default: 0,
	},

	avgPrice: {
		type: Number,
	},

	lastPrice:{
		type: Number,
	},

	profit: {
		type: Number,
	},

});

module.exports = Position;