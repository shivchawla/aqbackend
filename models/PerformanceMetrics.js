/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:01
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-22 14:20:35
*/

'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

const PerformanceMetrics  = new Schema({
    date: Date,
    performance: Schema.Types.Mixed,
    rating: Number,
});

module.exports = PerformanceMetrics;