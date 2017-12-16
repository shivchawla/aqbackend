/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:25:47
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-12-16 13:09:15
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const TimeValue = new Schema({
	 time:{
	 	type: Date,
	 	required:true,
	 },

	 value:{
	 	type: Number,
	 	required: true,
	 },

});
