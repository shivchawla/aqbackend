/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:25:47
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-04-19 19:00:26
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const TimeValue = new Schema({
	 time:{
	 	type: Date,
	 	require:true,
	 },

	 value:{
	 	type: Number,
	 	require: true,
	 },

});
