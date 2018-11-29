/*
* @Author: Shiv Chawla
* @Date:   2018-10-27 14:10:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-28 20:45:17
*/


'use strict';
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const moment = require('moment');
const Schema = mongoose.Schema;
const DateHelper = require('../../utils/Date');
const Advisor = require('./Advisor');

const DailyContestEntryPerformance = new Schema({
	advisor : {type: Schema.Types.ObjectId, ref: 'Advisor'},
	
	date: Date,
	
	pnlStats: {
		detail: Schema.Types.Mixed, 
		net: Schema.Types.Mixed,
	},

	earningStats: Schema.Types.Mixed
});

DailyContestEntryPerformance.index({advisor: 1, date:1}, {unique: true});
DailyContestEntryPerformance.index({advisor: 1}, {unique: false});

DailyContestEntryPerformance.statics.fetch  = function() {
	return this.find({},{advisor:1});
}

DailyContestEntryPerformance.statics.updatePnlStatsForDate = function(query, pnlStats, date, category="detail") {
	
	var key = `pnlStats.date`;
	var updateFieldInArray = `pnlStats.${category}`;

	let qDate = {...query, date: date};
    const updates = {
    	$set: {[updateFieldInArray]: pnlStats}
 	};
		 	
    return this.findOneAndUpdate(qDate, updates, {upsert: true});

};

DailyContestEntryPerformance.statics.fetchLatestPnlStats = function(query) {
	const date = DateHelper.getMarketCloseDateTime(DateHelper.getCurrentDate()); 
	return this.find({...query, date:{$lte: date}}, {pnlStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return latestDoc && latestDoc.length > 0 ? _.get(latestDoc[0], 'pnlStats', null) : null;
	});
};

DailyContestEntryPerformance.statics.fetchLastPnlStats = function(query, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lt: date}}, {pnlStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return latestDoc && latestDoc.length > 0 ? _.get(latestDoc[0], 'pnlStats', null) : null;
	});
};

DailyContestEntryPerformance.statics.fetchPnlStatsForDate = function(query, date) {
	var projectionField = `pnlStats`;
	var key = `pnlStats.date`;
	return this.findOne({...query, date: date}, {[projectionField]: 1})
	.then(doc => {
		return _.get(doc, 'pnlStats', null);
	})
};

DailyContestEntryPerformance.statics.fetchPnlStatsHistory = function(query) {
	return this.find(query, {pnlStats: 1});
};

const DailyContestEntryPerformanceModel = mongoose.model('DailyContestEntryPerformance', DailyContestEntryPerformance);
module.exports = DailyContestEntryPerformanceModel;