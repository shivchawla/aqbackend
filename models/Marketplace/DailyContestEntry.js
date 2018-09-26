/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:46:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-26 11:51:39
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

const DailyContestEntry = new Schema({  
	advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
	
	createdDate:Date,
	
	updatedDate: Date,

	portfolioDetail: [{
		date: Date,
		modified: {type:Number, default: 0},
		positions: [DollarPosition],
		active: {type: Boolean, default: true},
	}],

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
1. Daily Contest with daily entires
	Entry is not carried forward the next contest unless user enters the contest deliberately
	Winner = Highest Daily Change
2. Daily Contest with weekly entries
	Entry is carried forward the next contest fot a period of 5 days after which it is dropped
	Winner = (Rolling 5 day pnl - Rolling 5 day pnl of holding benchmark)
	If user doesn't enter after 5 days, entries continues but 

*/

DailyContestEntry.statics.createEntry = function(contestEntry) {
    const dailyContestEntry = new this(contestEntry);
    return dailyContestEntry.saveAsync();
}

/*DailyContestEntry.statics.addPortfolio = function(query, portfolio) {
    return this.findOneAndUpdate(query, {$push: {detail: {...portfolio, modified: 0}}});
}*/

DailyContestEntry.statics.updateEntryPortfolio = function(query, portfolio, options) {
    const date = portfolio.date;
    const activeStatus = portfolio.active ? portfolio.active : true
    
    let updates = {
		$set: {'portfolioDetail.$.positions': portfolio.positions, active: activeStatus},
		$inc: {'portfolioDetail.$.modified': 1}
	};

	let q = {...query, 'portfolioDetail.date':{$eq: date}};
	return this.findOne(q)
	.then(found => {
		if (found) {
			return this.findOneAndUpdate(q, updates, options)
		} else {
			updates = {$push: {portfolioDetail: portfolio}};
			return this.findOneAndUpdate(query, updates, options);
		}
	})
};

DailyContestEntry.statics.updateEntryPnlStats = function(query, pnlStats, date) {
	
    let qDate;
    let daily = pnlStats.daily ? true : false;

    if (daily){
		qDate = {...query, 'performance.daily.date':{$eq: date}};
    } else {
		qDate = {...query, 'performance.weekly.date':{$eq: date}};
    }
   
    return this.findOne(q)
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

DailyContestEntry.statics.fetchEntryPortfolioForDate = function(query, date) {
	return this.findOne({...query, 'portfolioDetail.date': date}, {advisor: 1, 'portfolioDetail.$': 1, createdDate:1, updatedDate: 1});
};

DailyContestEntry.statics.fetchEntryPnlStatsForDate = function(query, date) {
	return this.findOne({...query, 'performance.daily.date': date}, {advisor: 1, 'performance.daily.$': 1});
};

DailyContestEntry.statics.fetchEntryPnlStatsForWeek = function(query, date) {
	return this.findOne({...query, 'performance.weekly.date': date}, {advisor: 1, 'performance.weekly.$': 1});
};


const DailyContestEntryModel = mongoose.model('DailyContestEntry', DailyContestEntry);
module.exports = DailyContestEntryModel;



