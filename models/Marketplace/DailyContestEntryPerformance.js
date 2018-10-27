/*
* @Author: Shiv Chawla
* @Date:   2018-10-27 14:10:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-27 17:03:08
*/


'use strict';
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const moment = require('moment');
const Schema = mongoose.Schema;

const DailyContestEntry = require('./DailyContestEntry');

const DailyContestEntryPerformance = new Schema({
	contestEnry : {type: Schema.Types.ObjectId, ref: 'DailyContestEntry'},

	pnlStats: [{
		date: Date,
		daily: Schema.Types.Mixed,
		total: {
			active: Schema.Types.Mixed,
			all: Schema.Types.Mixed
		},
	}],

	winnings: [{
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


DailyContestEntryPerformance.statics.updateEntryPnlStats = function(query, pnlStats, date) {
	
	let daily = pnlStats.daily ? true : false;

    return this.findOne({...query, 'pnlStats.date':{$eq: date}})
    .then(found => {	
		let updates;
    	
    	if (found) {
    		
    		updates = {
		    	$set: daily ? {'pnlStats.$.daily': pnlStats.daily} : 
		    		{'pnlStats.$.total': pnlStats.total}
		 	};
		 	
		 	return this.findOneAndUpdate(qDate, updates);
    	} else {

    		updates = {$push: daily ? 
				{'pnlStats.daily': {date: date, pnlStats: pnlStats.daily}} : 
				{'pnlStats.total': {date: date, pnlStats: pnlStats.total}} 
			};
    		return this.findOneAndUpdate(query, updates);
    	}
    });
};

DailyContestEntryPerformance.statics.fetchLatestPnlStats = function(query) {
	return this.findOneAndUpdate(query, {pnlStats: {$slice: -1}})
};

DailyContestEntryPerformance.statics.fetchTotalPnlStatsForDate = function(query, date) {
	return this.findOneAndUpdate({...query, 'pnlStats.date': date}, {'pnlStats.$.total': 1});
};

DailyContestEntryPerformance.statics.fetchDailyPnlStatsForDate = function(query, date) {
	return this.findOneAndUpdate({...query, 'pnlStats.date': date}, {'pnlStats.$.daily': 1});
};

const DailyContestEntryPerformanceModel = mongoose.model('DailyContestEntryPerformance', DailyContestEntryPerformance);
module.exports = DailyContestEntryPerformanceModel;