/*
* @Author: Shiv Chawla
* @Date:   2018-12-08 15:12:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-08 15:36:04
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Security = require('./Security');
const SecurityIntradayHistory = new Schema({
	security: Security,
	date: Date,
	history: [Schema.Types.Mixed],
});

SecurityIntradayHistory.index({'security.ticker': 1, date: 1}, {unique: true});
SecurityIntradayHistory.index({date: 1});

SecurityIntradayHistory.index({
    'security.ticker': 'text',
    'security.name': 'text',
    'security.detail.NSE_Name': 'text'
});

SecurityIntradayHistory.statics.addHistory = function(query, snapShot) {
	return this.findOneAndUpdate(query, {'$push': {history: snapShot}}, {upsert: true})
};

SecurityIntradayHistory.statics.updateHistory = function(query, history) {
	return this.findOneAndUpdate(query, {'$set': {history: history}}, {upsert: true})
};

SecurityIntradayHistory.statics.fetchHistory = function(query) {
	return this.findOne(query)
	.select('security history')
	.execAsync();
};


const SecurityIntradayHistory = mongoose.model('SecurityIntradayHistory', SecurityIntradayHistory);
module.exports = SecurityIntradayHistory;
