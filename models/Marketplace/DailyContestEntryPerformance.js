/*
* @Author: Shiv Chawla
* @Date:   2018-10-27 14:10:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-29 20:06:35
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

	pnlStats: [{
		date: Date,
		daily: Schema.Types.Mixed,
		total: {
			realized: Schema.Types.Mixed, //sum of pnl of ended predictions
			unrealized: Schema.Types.Mixed, //sum of pnl of active predictions (and not ended)
			all: Schema.Types.Mixed //sum of pnl of active predictions (included ended)
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
	
    let qDate = {...query, 'pnlStats.date':{$eq: date}};
    
    return this.findOne(qDate)
    .then(found => {	
		let updates;
    	
    	if (found) {
    		
    		updates = {
		    	$set: {'pnlStats.$.daily': pnlStats.daily,
		 				'pnlStats.$.total': pnlStats.total}
		 	};
		 	
		 	return this.findOneAndUpdate(qDate, updates);
    	} else {

    		updates = {
				$push: {
					pnlStats: {
						date: date, 
						daily: pnlStats.daily, 
						total: pnlStats.total
					}
				}
			};	 

    		return this.findOneAndUpdate(query, updates, {upsert: true});
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