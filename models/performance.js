/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-02-27 15:01:07
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

const Performance = new Schema({
	profit: Number,

});

//const PerformanceModel = mongoose.model('Performance', Performance)
module.exports = Performance;
