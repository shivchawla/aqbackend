/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-02-28 11:29:09
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

const Security = new Schema({
	ticker: {
		type: String,
		require: true,	
	},
	name: {
		type: String,	
	},
	exchange: {
		type: String,
		require: true,	
	}, 
	country: {
		type: String,
		require: true,	
	}, 
	securityType: {
		type: String,
		require: true,
	},
	startDate: {
		type: Date
	},
	endDate: {
		type: Date,
	}

});

//const SecurityModel = mongoose.model('Security', Security);
//module.exports = SecurityModel;
module.exports = Security;