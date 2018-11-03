/*
* @Author: Shiv Chawla
* @Date:   2018-10-27 14:10:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-03 13:15:53
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
		cumulative: Schema.Types.Mixed,    
	}],

	//{active: {"unre:b" rea:0 all:b} 
	//ended: {unrea: 0, real:z, "all: z"} 
	//started: {unreal: x, realized: y, "all: x+y"}}

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
		 				'pnlStats.$.cumulative': pnlStats.cumulative}
		 	};
		 	
		 	return this.update(qDate, updates);

    	} else {

    		updates = {
				$push: {
					pnlStats: {
						date: date, 
						daily: pnlStats.daily, 
						cumulative: pnlStats.cumulative,
					}
				}
			};	 

    		return this.findOneAndUpdate(query, updates, {upsert: true})
    	}
    });
};

DailyContestEntryPerformance.statics.fetchLatestPnlStats = function(query) {
	return this.findOne(query, {pnlStats: {$slice: -1}})
};

DailyContestEntryPerformance.statics.fetchPnlStatsForDate = function(query, date) {
	return this.findOne({...query, 'pnlStats.date': date}, {'pnlStats.$': 1});
};

const DailyContestEntryPerformanceModel = mongoose.model('DailyContestEntryPerformance', DailyContestEntryPerformance);
module.exports = DailyContestEntryPerformanceModel;