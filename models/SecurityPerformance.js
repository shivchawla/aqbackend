/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-08-29 13:55:12
*/

'use strict';
const mongoose = require('./index');
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


SecurityPerformance.statics.saveSecurityPerformance = function(securityPerformance) {
	const sp = new this(securityPerformance);
	return sp.save();
};

SecurityPerformance.statics.fetchSecurityPerformance = function(query, options) {
	return this.findOne(query)
	.select(options.fields)
	.execAsync();
};


SecurityPerformance.statics.updatePerformance = function(query, updates) {
	return this.findOne(query)
	.then(securityPerformance => {
		Object.keys(updates).forEach(key => {
			securityPerformance[key] = updates[key];
		});	
	})
};

SecurityPerformance.statics.updatePriceHistory = function(query, priceHistory) {
	return this.findOne(query)
	.then(securityPerformance => {
		//console.log("Update History");
		//console.log(priceHistory);
		/*var ph = [];
		
		Object.keys(priceHistory).forEach(key => {
			ph.push({date: new Date(key), price: priceHistory[key]});
		});*/

		securityPerformance["priceHistory"] = {values: priceHistory, updatedDate: new Date()};
		//console.log(securityPerformance);
		return securityPerformance.save();	
	})
};

SecurityPerformance.statics.updateRollingPerformance = function(query, rollingPerformance) {
	return this.findOne(query)
	.then(securityPerformance => {
		securityPerformance["rollingPerformance"] = {detail: rollingPerformance, updatedDate: new Date()};
		return securityPerformance.save();	
	})
};

SecurityPerformance.statics.updateStaticPerformance = function(query, staticPerformance) {
	return this.findOne(query)
	.then(securityPerformance => {
		securityPerformance["staticPerformance"] = {detail: staticPerformance, updatedDate: new Date()};
		return securityPerformance.save();	
	})
};

SecurityPerformance.statics.updateLatestDetail = function(query, latestDetail) {
	return this.findOne(query)
	.then(securityPerformance => {
		securityPerformance["latestDetail"] = {values: latestDetail, updatedDate: new Date()};
		return securityPerformance.save();	
	})
};

SecurityPerformance.statics.fetchPerformance = function(query) {
	return this.findOne(query)
	.select('security rollingPerformance staticPerformance latestDetail')
	.execAsync();
};

SecurityPerformance.statics.fetchStaticPerformance = function(query) {
	return this.findOne(query)
	.select('staticPerformance')
	.execAsync();
};

SecurityPerformance.statics.fetchRollingPerformance = function(query) {
	return this.findOne(query)
	.select('rollingPerformance')
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
