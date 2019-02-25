/*
* @Author: Shiv Chawla
* @Date:   2018-10-27 14:10:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-02-24 14:29:41
*/


'use strict';
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const moment = require('moment');
const Schema = mongoose.Schema;
const DateHelper = require('../../utils/Date');
const Advisor = require('./Advisor');


const EarningStat = new Schema({
	total: Number, 
	detail: [{date: Date, value: Number}]
});

const DailyContestEntryPerformance = new Schema({
	advisor : {type: Schema.Types.ObjectId, ref: 'Advisor'},
	
	date: Date,

	portfolioStats: Schema.Types.Mixed,
	
	pnlStats: {
		detail: Schema.Types.Mixed, 
		net: Schema.Types.Mixed,
	},

	performanceStats: Schema.Types.Mixed,

	earnings: {
		daily: {current: Number, cumulative: Number},
		weekly: {current: Number, cumulative: Number},
		monthly: {current: Number, cumulative: Number}
	}
});

DailyContestEntryPerformance.index({advisor: 1, date:1}, {unique: true});
DailyContestEntryPerformance.index({advisor: 1}, {unique: false});

DailyContestEntryPerformance.statics.updatePnlStatsForDate = function(query, pnlStats, date, category="detail") {
	
	var key = `pnlStats.date`;
	var updateFieldInArray = `pnlStats.${category}`;

	let qDate = {...query, date: date};
    const updates = {
    	$set: {[updateFieldInArray]: pnlStats}
 	};
		 	
    return this.findOneAndUpdate(qDate, updates, {upsert: true});
};

DailyContestEntryPerformance.statics.updatePortfolioStatsForDate = function(query, portfolioStats, date) {
	
	let qDate = {...query, date: date};
    const updates = {
    	$set: {portfolioStats: portfolioStats}
 	};
		 	
    return this.findOneAndUpdate(qDate, updates, {upsert: true});
};


DailyContestEntryPerformance.statics.updatePerformanceStatsForDate = function(query, performanceStats, date) {
	
	let qDate = {...query, date: date};
    const updates = {
    	$set: {performanceStats: performanceStats}
 	};
		 	
    return this.findOneAndUpdate(qDate, updates, {upsert: true});
};


DailyContestEntryPerformance.statics.fetchLatestPnlStats = function(query, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lte: date}, pnlStats:{$exists: true}}, {pnlStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return latestDoc && latestDoc.length > 0 ? _.get(latestDoc[0], 'pnlStats', null) : null;
	});
};

DailyContestEntryPerformance.statics.fetchLastPnlStats = function(query, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lt: date}, pnlStats:{$exists: true}}, {pnlStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return _.get(latestDoc, '[0].pnlStats', null);
	});
};

DailyContestEntryPerformance.statics.fetchLatestPortfolioStats = function(query, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lte: date}, portfolioStats:{$exists: true}}, {portfolioStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return latestDoc && latestDoc.length > 0 ? _.get(latestDoc[0], 'portfolioStats', null) : null;
	});
};

DailyContestEntryPerformance.statics.fetchLastPortfolioStats = function(query, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lt: date}, portfolioStats:{$exists: true}}, {portfolioStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return _.get(latestDoc, '[0].portfolioStats', null);
	});
};

DailyContestEntryPerformance.statics.fetchLatestPnlStatsForSymbol = function(query, symbol, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lte: date}, pnlStats:{$exists: true}}, {pnlStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		const total = {
			..._.get(latestDoc, `[0].pnlStats.net.total.byTickers[${symbol}]`, null),
			tickers: Object.keys(_.get(latestDoc, `[0].pnlStats.net.total.byTickers`, {}))
		};
		const realized = {
			..._.get(latestDoc, `[0].pnlStats.net.realized.byTickers[${symbol}]`, null),
			tickers: Object.keys(_.get(latestDoc, `[0].pnlStats.net.realized.byTickers`, {}))
		};
		
		if (total === null && realized === null) {
			return null;
		} else {
			return {total, realized};
		}
	});
};

DailyContestEntryPerformance.statics.fetchPnlStatsForDate = function(query, date) {
	var projectionField = `pnlStats`;
	return this.findOne({...query, date: date}, {[projectionField]: 1})
	.then(doc => {
		return _.get(doc, 'pnlStats', null);
	})
};

DailyContestEntryPerformance.statics.fetchPortfolioStatsForDate = function(query, date) {
	var projectionField = `portfolioStats`;
	return this.findOne({...query, date: date}, {[projectionField]: 1})
	.then(doc => {
		return _.get(doc, 'portfolioStats', null);
	})
	.then(portfolioStatsForDate => {
		if (!portfolioStatsForDate) {
			return this.fetchLastPortfolioStats(query, date);
		} else {
			return portfolioStatsForDate;
		}
	})
};


DailyContestEntryPerformance.statics.fetchPerformanceStatsForDate = function(query, date) {
	var projectionField = `performanceStats`;
	return this.findOne({...query, date: date}, {[projectionField]: 1})
	.then(doc => {
		return _.get(doc, 'performanceStats', null);
	})
};

DailyContestEntryPerformance.statics.fetchLatestPerformanceStats = function(query, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lte: date}, performanceStats:{$exists: true}}, {performanceStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return latestDoc && latestDoc.length > 0 ? _.get(latestDoc[0], 'performanceStats', null) : null;
	});
};

DailyContestEntryPerformance.statics.fetchLastPerformanceStats = function(query, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : DateHelper.getDate(date)); 
	return this.find({...query, date:{$lt: date}, performanceStats:{$exists: true}}, {performanceStats:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return _.get(latestDoc, '[0].performanceStats', null);
	});
};

DailyContestEntryPerformance.statics.fetchPnlStatsHistory = function(query, date) {
	return this.find({...query, date:{$lte: date}}, {date:1, pnlStats: 1})
	.then(allDocs => {
		return allDocs.map(item => _.pick(item, ['date', 'pnlStats']));
	})
};

DailyContestEntryPerformance.statics.fetchPortfolioStatsHistory = function(query, date) {
	return this.find({...query, date:{$lte:date}}, {date:1, portfolioStats: 1})
	.then(allDocs => {
		return allDocs.map(item => _.pick(item, ['date', 'portfolioStats']));
	})
};

DailyContestEntryPerformance.statics.fetchPerformanceStatsHistory = function(query) {
	return this.find(query, {date:1, performanceStats: 1})
	.then(allDocs => {
		return allDocs.map(item => _.pick(item, ['date', 'performanceStats']));
	})
};

DailyContestEntryPerformance.statics.updateEarningStats = function(query, date, earningDetail) {
	
	var category = _.get(earningDetail, 'category', "daily");
	var key = `earnings.${category}`;

	return this.find({...query, date:{$lt: date}, earnings:{$exists: true}}, {earnings:1}).sort({date: -1}).limit(1)
	.then(latestDoc => {
		return latestDoc && latestDoc.length > 0 ? _.get(latestDoc[0], key, null) : null;
	})
	.then(lastEarnings => {
		var lastCumulativeAmount = _.get(lastEarnings, 'cumulative', 0);
		
		var currentAmount = _.get(earningDetail, 'earnings', 0);
		var newCumulativeAmount = lastCumulativeAmount + currentAmount;

		var updates = {current: currentAmount, cumulative: newCumulativeAmount};
		
		return this.updateOne({...query, date: date}, {$set: {[key]: updates}});

	});
};

DailyContestEntryPerformance.statics.fetchDistinctPerformances = function(query, skip = 0, limit = 10) {
	return new Promise((resolve, reject) => {
		this.aggregate(
			[
				{
					$group:
					  {
						_id: "$advisor",
						id: { $last: "$_id" },
						currentDate: {$last: "$date"},
						totalDaily: {$last: "$earnings.daily.cumulative"},
						totalWeekly: {$last: "$earnings.weekly.cumulative"},
						portfolioStats: {$last: "$portfolioStats"},
						pnlStats: {$last: "$pnlStats"},
					}
				},
				{$sort: {'totalDaily': -1, 'totalWeekly': -1}},
				{$skip: skip},
				{$limit: limit},
				{
				   $project:{
					   _id:"$id",
					   advisor: "$_id",
					   date: "$currentDate",
					   totalDaily: "$totalDaily",
					   totalWeekly: "$totalWeekly",
					   pnlStats: "$pnlStats",
					   portfolioStats: "$portfolioStats",
					}
				}   
			]
		)
		.allowDiskUse(true)
		.exec((err, transactions) => {
			if (err) {
				reject(err);
			} else {
				this.populate(
					transactions, 
					{
						path: 'advisor', 
						select: 'user',
						populate: {
							path: 'user',
							select: 'firstName lastName _id'
						}
					},
					function(err, populatedTransactions) {
						if (err) {
							reject(err);
						} else {
							resolve(populatedTransactions);
						}
					}
				);
			}
		})
	})
};

const DailyContestEntryPerformanceModel = mongoose.model('DailyContestEntryPerformance', DailyContestEntryPerformance);
module.exports = DailyContestEntryPerformanceModel;


