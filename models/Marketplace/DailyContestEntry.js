/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:46:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-08 13:25:30
*/


'use strict';
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');
const Schema = mongoose.Schema;

const Security = require('./Security');

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

const DailyContestEntry = new Schema({  
	advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
	
	createdDate:Date,
	
	updatedDate: Date,

	detail: [{
		date: Date,
		modified: {type:Number, default: 0},
		positions: [{
			security: Security,
			investment: {
				type: Number,
				required: true,
				default: 0,
			}
		}]
	}],

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

DailyContestEntry.statics.createEntry = function(contestEntry) {
    const dailyContestEntry = new this(contestEntry);
    return dailyContestEntry.saveAsync();
}

/*DailyContestEntry.statics.addPortfolio = function(query, portfolio) {
    return this.findOneAndUpdate(query, {$push: {detail: {...portfolio, modified: 0}}});
}*/

DailyContestEntry.statics.updateEntry = function(query, portfolio) {
    const date = portfolio.date;
    const updates = {
    	$set: {'detail.$.positions': portfolio.positions},
     	$inc: {'detail.$.modified': 1}
 	};

    return this.findOneAndUpdate({...query, 'detail.date':{$eq: date}}, updates);
    
};

DailyContestEntry.statics.fetchEntry = function(query, options) {
	var q = this.findOne(query);
	if (options && options.fields) {
		q = q.select(options.fields);
	}

	return q.execAsync();
};

DailyContestEntry.statics.fetchEntryForDate = function(query, date) {
	return this.findOne({...query, 'detail.date': date}, {'detail.$': 1, createdDate:1, updatedDate:1});
};

const DailyContestEntryModel = mongoose.model('DailyContestEntry', DailyContestEntry);
module.exports = DailyContestEntryModel;