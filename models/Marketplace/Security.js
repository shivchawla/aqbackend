/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-15 14:54:59
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Security = new Schema({
	ticker: {
		type: String,
		required: true,	
	},
	name: {
		type: String,	
	},
	exchange: {
		type: String,
		default: "NSE",
		required: true,	
	}, 
	country: {
		type: String,
		default: "IN",
		required: true,	
	}, 
	securityType: {
		type: String,
		default: "EQ",
		required: true,
	},
	startDate: {
		type: Date
	},
	endDate: {
		type: Date,
	},
	detail: Schema.Types.Mixed,

});

module.exports = Security;
