/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:01
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-09-04 12:39:45
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const PerformanceMetrics  = new Schema({
    date: Date,
    detail: Schema.Types.Mixed,
});

module.exports = PerformanceMetrics;