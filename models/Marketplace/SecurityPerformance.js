/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-29 17:06:31
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Security = require('./Security');
const SecurityPerformance = new Schema({
	
	security: Security,

	priceHistory: {
		updatedDate: Date,
		values: Schema.Types.Mixed,
	},

	rollingPerformance: {
		updatedDate: Date, 
		detail: Schema.Types.Mixed,
	},

	staticPerformance: {
		updatedDate: Date, 
		detail: Schema.Types.Mixed,
	},

	latestDetail :{
		updatedDate: Date,
		values: Schema.Types.Mixed,
	}
});

SecurityPerformance.index({'security.ticker': 1}, {unique: true});

SecurityPerformance.index({
    'security.ticker': 'text',
    'security.name': 'text',
    'security.detail.NSE_Name': 'text'
});


SecurityPerformance.statics.saveSecurityPerformance = function(securityPerformance) {
	const sp = new this(securityPerformance);
	return sp.save();
};

SecurityPerformance.statics.fetchSecurityPerformance = function(query, options) {
	return this.findOne(query)
	.select(options.fields)
	.execAsync();
};

SecurityPerformance.statics.fetchSecurityPerformances = function(query, options) {
	return this.find(query)
	.select(options.fields)
	.limit(options.limit ? options.limit : 0)
	.execAsync();
};

SecurityPerformance.statics.updateSecurityPerformance = function(query, updates) {
	return this.findOneAndUpdate(query, {'$set': updates}, {upsert: true})
};

SecurityPerformance.statics.updatePriceHistory = function(query, priceHistory) {
	var updates = {priceHistory: {values: priceHistory, updatedDate: new Date()}};
	return this.findOneAndUpdate(query, {$set: updates}, {fields: 'security priceHistory', new:true});
};

SecurityPerformance.statics.updateRollingPerformance = function(query, rollingPerformance) {
	var updates = {rollingPerformance: {detail: rollingPerformance, updatedDate: new Date()}};
	return this.findOneAndUpdate(query, {$set: updates}, {fields: 'security rollingPerformance', new:true});
};

SecurityPerformance.statics.updateStaticPerformance = function(query, staticPerformance) {
	var updates = {staticPerformance: {detail: staticPerformance, updatedDate: new Date()}};
	return this.findOneAndUpdate(query, {$set: updates}, {fields: 'security staticPerformance', new:true});
};

SecurityPerformance.statics.updateLatestDetail = function(query, latestDetail) {
	var updates = {latestDetail: {values: latestDetail, updatedDate: new Date()}};
	return this.findOneAndUpdate(query, {$set: updates}, {fields: 'security latestDetail', new:true});
};

SecurityPerformance.statics.fetchPerformance = function(query) {
	return this.findOne(query)
	.select('security rollingPerformance staticPerformance latestDetail')
	.execAsync();
};

SecurityPerformance.statics.fetchStaticPerformance = function(query) {
	return this.findOne(query)
	.select('staticPerformance security')
	.execAsync();
};

SecurityPerformance.statics.fetchRollingPerformance = function(query) {
	return this.findOne(query)
	.select('rollingPerformance security')
	.execAsync();
};

SecurityPerformance.statics.fetchPriceHistory = function(query) {
	return this.findOne(query)
	.select('security priceHistory')
	.execAsync();
};

SecurityPerformance.statics.fetchLatestDetail = function(query) {
	return this.findOne(query)
	.select('security latestDetail')
	.execAsync();
};


const SecurityPerformanceModel = mongoose.model('SecurityPerformance', SecurityPerformance);
module.exports = SecurityPerformanceModel
