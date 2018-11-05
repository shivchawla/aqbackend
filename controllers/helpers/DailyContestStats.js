/*
* @Author: Shiv Chawla
* @Date:   2018-10-29 15:21:17
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-05 13:24:48
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');

const DateHelper = require('../../utils/Date');
const DailyContestEntryHelper = require('./DailyContestEntry');
const sendEmail = require('../../email');

const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');


function _computeContestWinners(date) {
	return DailyContestEntryModel.fetchEntries({}, {fields: '_id advisor'})
	.then(allEntries => {
		return Promise.mapSeries(allEntries, function(contestEntry) {
			return DailyContestEntryHelper.getTotalPnlStats(contestEntry._id, date, "ended")
			.then(pnlStatsForAdvisor => {
				return Object.assign({advisor: contestEntry.advisor._id}, {pnlStats: pnlStatsForAdvisor});
			})
		})
		.then(pnlStatsForAllAdvisors => {
			return pnlStatsForAllAdvisors
			.sort((a,b) => {return a.pnlStats.total.pnlPct > b.pnlStats.total.pnlPct ? -1 : 1})
			.slice(0, 5)
			.map((item, index) => {item.rank = index+1; return item;});
		})
	})
}

function _initializeMetrics(prediction) {
	var investment = prediction.position.investment;
	var security = prediction.security;
	var endDate = prediction.endDate;
	
	return {
		numUsers: {
			long: investment > 0 ? 1 : 0,
			short: investment < 0 ? 1 : 0,
			total: 1
		},

		investment: {
			long: investment > 0 ? Math.abs(investment) : 0,
			short: investment < 0 ? Math.abs(investment) : 0,
			net: investment,
			gross: Math.abs(investment)
		}
	}
}

function _updateMetrics (metrics, prediction) {
	var investment = prediction.position.investment;
	var security = prediction.security;
	var endDate = prediction.endDate;
	metrics.numUsers.long += investment > 0 ? 1 : 0 ;
	metrics.investment.long += investment > 0 ? Math.abs(investment) : 0 ;
	
	metrics.numUsers.short += investment < 0 ? 1 : 0 ;
	metrics.investment.short += investment < 0 ? Math.abs(investment) : 0 ;
	
	metrics.numUsers.total++;
	metrics.investment.net += investment;
	metrics.investment.gross += Math.abs(investment);

	return metrics;
}

function _computeContestPredictionMetrics(date) {
	return DailyContestEntryModel.fetchEntries({}, {fields: '_id advisor'})
	.then(allEntries => {
		return Promise.mapSeries(allEntries, function(contestEntry) {
			return DailyContestEntryHelper.getPredictionsForDate(contestEntry._id, date, "started")
		})
		.then(predictionsByAdvisors => {
			return Array.prototype.concat.apply([], predictionsByAdvisors);
		})
	})
	.then(allPredictions => {
		var predictionMetricsByDate = {};
		var predictionMetricsPerSecurity = {};
		var predictionMetrics = null;
		allPredictions.forEach(prediction => {
			var security = prediction.position.security;
			var endDate = prediction.endDate;
			let dateStr = DateHelper.formatDate(endDate);
			if (dateStr in predictionMetricsByDate) {
				predictionMetricsByDate[dateStr] = _updateMetrics(predictionMetricsByDate[dateStr], prediction);
			} else {
				predictionMetricsByDate[dateStr] = _initializeMetrics(prediction);
			}

			let ticker = security.ticker;
			
			//handle per security
			if (ticker in predictionMetricsPerSecurity) {
				predictionMetricsPerSecurity[ticker] = _updateMetrics(predictionMetricsPerSecurity[ticker], prediction)
			} else {
				predictionMetricsPerSecurity[ticker] = _initializeMetrics(prediction);
			}

			if (predictionMetrics) {
				predictionMetrics = _updateMetrics(predictionMetrics, prediction);
			} else {
				predictionMetrics = _initializeMetrics(prediction);
			}
		})

		return {all: predictionMetrics, 
				byDate: predictionMetricsByDate, 
				bySecurity: predictionMetricsPerSecurity};
	})
}

module.exports.updateContestStats = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	//Get al entries started on a date
	return Promise.all([
		_computeContestWinners(date),
		_computeContestPredictionMetrics(date)
	])
	.then(([winners, predictionMetrics]) => {
		var predictionMetricsBySecurity = predictionMetrics.bySecurity;
		var metricsArray = Object.keys(predictionMetricsBySecurity)
						.map(item => {return {ticker: item, ...predictionMetricsBySecurity[item]}});
		
		var topStocksUsers = metricsArray.sort((a,b) => {
			return a.numUsers.total > b.numUsers.total ? -1 : 1
		}).slice(0, 5);

		var topStocksInvestment = metricsArray.sort((a,b) => {
			return a.investment.total > b.investment.total ? -1 : 1
		}).slice(0, 5);

		var topStocks = {byUsers: topStocksUsers, byInvestment: topStocksInvestment};

		return DailyContestStatsModel.updateContestStats(date, {winners, predictionMetrics, topStocks});
	});

};

module.exports.updateContestTopStocks = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	//Get al entries started on a date
	return _computeContestPredictionMetrics(date)
	.then(predictionMetrics => {
		var predictionMetricsBySecurity = predictionMetrics.bySecurity;
		var metricsArray = Object.keys(predictionMetricsBySecurity)
						.map(item => {return {ticker: item, ...predictionMetricsBySecurity[item]}});
		
		var topStocksUsers = metricsArray.sort((a,b) => {
			return a.numUsers.total > b.numUsers.total ? -1 : 1
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocksInvestment = metricsArray.sort((a,b) => {
			return a.investment.total > b.investment.total ? -1 : 1
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocks = {byUsers: topStocksUsers, byInvestment: topStocksInvestment};

		return DailyContestStatsModel.updateContestStats(date, {predictionMetrics, topStocks});
	});
};

function _computeWinnerDigest(winners) {
	return Promise.mapSeries(winners, function(winner) {
		const winnerAdvisorId = winner.advisor;

		return AdvisorModel.fetchAdvisor({_id: winnerAdvisorId})
		.then(advisor => {
			return {winnerName: `${advisor.firstName} {advisor.lastName}`, pnlPct:winner.pnlStats.total.pnlPct}		
		})
	})
	.then(winnerStats => {
		let winnerDigest = {};

		winnerStats.forEach((item, index) => {

			var winnerKey = `winner${index}`;
			var pnlKey = `pnlPct${index}`;
			winnerDigest = Object.assign(winnerDigest, {
				[winnerKey]: item.winnerName, 
				[pnlKey]: item.pnlPct
			});
		});

		return winnerDigest;
	})
}

module.exports.sendSummaryDigest = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	return Promise.all([
		DailyContestEntryModel.fetchEntries({}, {fields: 'advisor'}),
		DailyContestStatsModel.fetchContestStats({date: date}, {fields: 'topStocks winners'})
	])
	.then(([contestEntries, contestStats]) => {
		if (contestStats && contestEntries) {
			var winners = contestStats.winners.slice(0,2);
			var topStocks = contestStats.topStocks.slice(0, 2);

			var leaderboardUrl = `${config.get('hostname')}/dailycontest?tab=2&date=${date.format("YYYY-MM-DD")}`;
			var topStocksUrl = `${config.get('hostname')}/dailycontest?tab=1&date=${date.format("YYYY-MM-DD")}`;

			var summaryDigest = {leaderboardUrl, topStocksurl};		

			return _computeWinnerDigest(winners)
			.then(winnerDigest => {

				let topStocksDigest = {};
				topStocks.forEach((item, index) => {
					var stocksKey = `stock${index}`;
					var votesKey = `votes${index}`;
					var investmentKey = `investment${index}`;
				});

				topStocksDigest = Object.assign(topStocksDigest, {
					[stockKey]: item.winnerName, 
					[votesKey]: item.numUser.total,
					[investmentKey]: item.investment.gross
				});

				return Object.assign(summaryDigest, winnerDigest, topStocksDigest);
			})
			.then(fullDigest => {
				return Promise.mapSeries(contestEntries, function(contestEntry) {
					
					return AdvisorModel.fetchAdvisor({_id: contestEntry.advisor})
					.then(advisor => {
	                    var user = _.get(advisor, 'user', null);
	                    
	                    if (process.env.NODE_ENV === 'production') {
	                    
	                    	return sendEmail.sendDailyContestSummaryDigest(fullDigest, user)
	                	
	                	} else if(process.env.NODE_ENV === 'development') {
	                    
	                        return sendEmail.sendDailyContestSummaryDigest(fullDigest, 
	                            {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
                        }
                    });
                })
			})

		} else {
			console.log(`Summary Digest Error! No contest stats found for ${date}`);
		}
	});
};

module.exports.sendWinnerDigest = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	return DailyContestStatsModel.fetchContestStats({date: date}, {fields: 'topStocks winners'})
	.then(contestStats => {
		if (contestStats) {
			var winners = contestStats.winners;
			
			var leaderboardUrl = `${config.get('hostname')}/dailycontest?tab=2&date=${date.format("YYYY-MM-DD")}`;

			return Promise.mapSeries(winners, function(winner) {
				let winnerDigest = {leaderboardUrl, pnlPct: winner.pnlStats.total.pnlpct, rank: winner.rank};
				
				return AdvisorModel.fetchAdvisor({_id: winner.advisor})
				.then(advisor => {
                    var user = _.get(advisor, 'user', null);
                    
                    if (process.env.NODE_ENV === 'production') {
                    
                    	return sendEmail.sendDailyContestSummaryDigest(winnerDigest, user)
                	
                	} else if(process.env.NODE_ENV === 'development') {
                    
                        return sendEmail.sendDailyContestSummaryDigest(winner, 
                            {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
                    }
                });
            })
			
		} else {
			console.log(`Winner Digest Error! No contest stats found for ${date}`)
		}
	});
};


