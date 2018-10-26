/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:46:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-26 19:01:57
*/


'use strict';
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');
const Schema = mongoose.Schema;

const Security = require('./Security');
const DollarPosition = require('./DollarPosition');

const dateFormat = 'YYYY-MM-DD';

const RatingDetail = new Schema({
    value: Number,
    rank: Number,
    detail: [{field: String, ratingValue: Number, rank: Number, metricValue: Number}],
});

const Rank = new Schema({
    value: Number,
    date: Date,
    rating: {current: RatingDetail, simulated: RatingDetail}
});

const Prize = new Schema({
    rank: {
        type: Number,
        required: true
    },
    value: {
        type: Number,
        required: true
    }
});

const Prediction = new Schema({
	position: {
		type: DollarPosition,
		required: true
	},
	target: {
		type: Number,
		required: true
	},
	endDate: {
		type: Date,
		required: true
	},
	startDate: {
		type: Date,
		required: true
	},
	active: {type: Boolean, default: true},
	modified: {type:Number, default: 0}
});

const DailyContestEntry = new Schema({  
	advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
	
	createdDate: Date,
	
	updatedDate: Date,

	predictions: [Prediction],
		
	performance: {
		daily: [{
			date: Date,
			pnlStats: Schema.Types.Mixed
		}],

		weekly: [{
			date: Date,
			pnlStats: Schema.Types.Mixed
		}],

		aggregate: {
			pnlStats: Schema.Types.Mixed
		}
	}, 

	winnings: {
		total: Number,
		rank: Number,
		daily: [{
			date: Date,
			total: Number,
			rank: Number
		}]
	}

});


/*Rules
1. Entry Item can be added any day
2. EntryItem = Stock/Target/Direction/StartDate/EndDate
*/

DailyContestEntry.statics.createEntry = function(contestEntry) {
    const dailyContestEntry = new this(contestEntry);
    return dailyContestEntry.saveAsync();
}

DailyContestEntry.statics.addEntryPredictions = function(query, predictions, options) {
	return this.findOneAndUpdate(query, {$push: {predictions: {$each: predictions}}}, options)
};

DailyContestEntry.statics.updateEntryPredictions = function(query, predictions, date, options) {
	
	console.log(date);
	let updateOne = {
		updatedDate: new Date(),
		$pull: {predictions:{startDate: date}}
	};

	let updateTwo = {
		updatedDate: new Date(),
	 	$push: {predictions: {$each: predictions}}
	};

	return this.findOneAndUpdateAsync(query, updateOne)
	.then(() => {
		return this.findOneAndUpdateAsync(query, updateTwo);
	});

};

DailyContestEntry.statics.updateEntryPnlStats = function(query, pnlStats, date) {
	
    let qDate;
    let daily = pnlStats.daily ? true : false;

    if (daily){
		qDate = {...query, 'performance.daily.date':{$eq: date}};
    } else {
		qDate = {...query, 'performance.weekly.date':{$eq: date}};
    }
   
    return this.findOne(qDate)
    .then(found => {	
		let updates;
    	
    	if (found) {
    		
    		updates = {
		    	$set: daily ? {'performance.daily.$.pnlStats': pnlStats.daily} : 
		    		{'performance.weekly.$.pnlStats': pnlStats.weekly}
		 	};
		 	
		 	return this.findOneAndUpdate(qDate, updates);
    	} else {

    		updates = {$push: daily ? 
				{'performance.daily': {date: date, pnlStats: pnlStats.daily}} : 
				{'performance.weekly': {date: date, pnlStats: pnlStats.weekly}} 
			};
    		return this.findOneAndUpdate(query, updates);
    	}
    });
};


DailyContestEntry.statics.fetchEntry = function(query, options) {
	var q = this.findOne(query);
	if (options && options.fields) {
		q = q.select(options.fields);
	}

	return q.execAsync();
};


DailyContestEntry.statics.fetchEntryPredictionsForDate = function(query, date) {
	return this.findOne({...query, 'predictions.startDate': date}, {advisor: 1, 'predictions.$': 1, createdDate:1, updatedDate: 1});
};

DailyContestEntry.statics.fetchEntryPnlStatsForDate = function(query, date) {
	return this.findOne({...query, 'performance.daily.date': date}, {advisor: 1, 'performance.daily.$': 1});
};

DailyContestEntry.statics.fetchEntryPnlStatsForWeek = function(query, date) {
	return this.findOne({...query, 'performance.weekly.date': date}, {advisor: 1, 'performance.weekly.$': 1});
};


const DailyContestEntryModel = mongoose.model('DailyContestEntry', DailyContestEntry);
module.exports = DailyContestEntryModel;



