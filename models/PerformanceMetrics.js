/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:01
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-06-23 13:29:18
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

const PerformanceMetrics  = new Schema({
    date: Date,
    detail: Schema.Types.Mixed,
});

module.exports = PerformanceMetrics;