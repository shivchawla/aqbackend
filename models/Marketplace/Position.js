/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-12-16 13:09:09
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Security = require('./Security');
const Advice = require('./Advice');

const Position = new Schema({
	security: Security,

	quantity: {
		type: Number,
		required: true,
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

	//To track the orginating advice (if any)
	advice: {
		type: Schema.Types.ObjectId,
        ref: 'Advice', 
	},

});

module.exports = Position;