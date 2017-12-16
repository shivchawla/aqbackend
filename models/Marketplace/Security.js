/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-12-16 13:09:11
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
		required: true,	
	}, 
	country: {
		type: String,
		required: true,	
	}, 
	securityType: {
		type: String,
		required: true,
	},
	startDate: {
		type: Date
	},
	endDate: {
		type: Date,
	}

});

module.exports = Security;
