/*
* @Author: Shiv Chawla
* @Date:   2018-10-27 14:10:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-17 18:38:28
*/


'use strict';
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const moment = require('moment');
const Schema = mongoose.Schema;

const DailyContestEntry = require('./DailyContestEntry');

const DailyContestEntryPerformance = new Schema({
	contestEntry : {type: Schema.Types.ObjectId, ref: 'DailyContestEntry'},

	// pnlStats: [{
	// 	date: Date,
	// 	daily: Schema.Types.Mixed,
	// 	cumulative: Schema.Types.Mixed,    
	// }],

	pnlStats: [{
		date: Date,
		detail: Schema.Types.Mixed, // {cumulative: , daily: } for prediction that date
		net: Schema.Types.Mixed,
	}],

	earningStats: [{
		date: Date,
		cumulative: {
			total: Number,
			rank: Number,
		},
		daily: {
			total: Number,
			rank: Number
		}
	}]
});

DailyContestEntryPerformance.statics.fetch  = function() {
	return this.find({},{contestEntry:1});
}

DailyContestEntryPerformance.statics.updatePnlStatsForDate = function(query, pnlStats, date, category="detail") {
	
	var key = `pnlStats.date`;
	var updateFieldInArray = `pnlStats.$.${category}`;

	let qDate = {...query, 'pnlStats.date':{$eq: date}};
    
    return this.findOne(qDate)
    .then(found => {
		let updates;
    	
    	if (found) {
    		
    		updates = {
		    	$set: {[updateFieldInArray]: pnlStats}
			 };
		 	
		 	return this.update(qDate, updates);

    	} else {

    		updates = {
				$push: {
					pnlStats: {
						date: date, 
						[category]: pnlStats,
					}
				}
			};	 

    		return this.findOneAndUpdate(query, updates, {upsert: true})
    	}
    });
};

DailyContestEntryPerformance.statics.fetchLatestPnlStats = function(query) {
	var projectionField = `pnlStats`;
	return this.findOne(query, {projectionField: 1})
	.then(doc => {
		return doc.pnlStats ? doc.pnlStats.length > 0 ? 
			doc.pnlStats.sort((a,b) => moment(a.date).isBefore(moment(b.date)) ? -1 : 1).slice(-1) : null : null;
	})
};

DailyContestEntryPerformance.statics.fetchPnlStatsForDate = function(query, date) {
	var projectionField = `pnlStats.$`;
	var key = `pnlStats.date`;
	// console.log({...query, [key]: date});
	return this.findOne({...query, [key]: date}, {[projectionField]: 1})
	.then(doc => {
		const pnlStats = _.get(doc, 'pnlStats', null);
		return pnlStats ? pnlStats[0] : null;
	})
};

DailyContestEntryPerformance.statics.fetchPnlStatsHistory = function(query) {
	var projectionField = `pnlStats`;
	return this.findOne(query, {[projectionField]: 1});
};

const DailyContestEntryPerformanceModel = mongoose.model('DailyContestEntryPerformance', DailyContestEntryPerformance);
module.exports = DailyContestEntryPerformanceModel;