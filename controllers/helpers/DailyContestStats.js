/*
* @Author: Shiv Chawla
* @Date:   2018-10-29 15:21:17
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-29 16:08:00
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');

const DateHelper = require('../../utils/Date');

const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');

function _computeContestWinners(date) {
	return DailyContestEntryModel.fetchEntries({}, {fields: '_id advisor'})
	.then(allEntries => {
		return Promise.mapSeries(allEntries, function(contestEntry) {
			return exports.getTotalPnlStats(contestEntry._id, date, "ended")
			.then(pnlStatsForAdvisor => {
				return Object.assign({advisor: contestEntry.advisor}, pnlStatsForAdvisor);
			})
		})
		.then(pnlStatsForAllAdvisors => {
			return pnlStatsForAdvisor
			.sort((a,b) => {return a.total.pnlPct > b.total.pnlPct ? -1 : 1})
			.slice(0, 5)
			.map((item, index) => {item.rank = index+1; return item;});
		})
	})
}

function _initializeMetrics(prediction) {
	var investment = item.investment;
	var security = item.security;
	var endDate = item.endDate;
	
	return {
		numUsers: {
			long: investment > 0 ? 1 : 0,
			short: investment < 0 ? 1 : 0,
			total: 1
		},

		investment: {
			long: investment > 0 ? abs(investment) : 0,
			short: investment < 0 ? abs(investment) : 0,
			net: investment,
			gross: abs(investment)
		}
	}
}

function _updateMetrics (metrics, prediction) {
	var investment = item.investment;
	var security = item.security;
	var endDate = item.endDate;

	metrics.numUsers.long += investment > 0 ? 1 : 0 ;
	metrics.investment.long += investment > 0 ? abs(investment) : 0 ;
	
	metrics.numUsers.short += investment > 0 ? 1 : 0 ;
	metrics.investment.short += investment > 0 ? abs(investment) : 0 ;
	
	metrics.numUsers.total++;
	metrics.investment.net += investment;
	metrics.investment.gross += abs(investment);
}

function _computeContestPredictionMetrics(date) {
	return DailyContestEntryModel.fetchEntries({}, {fields: '_id advisor'})
	.then(allEntries => {
		return Promise.mapSeries(allEntries, function(contestEntry) {
			return exports.getPredictionsForDate(contestEntry._id, date, "started")
		})
		.then(predictionsByAdvisors => {
			return Array.prototype.concat.apply([], predictionsByAdvisors);
		})
	})
	.then(allPredictions => {
		var predictionMetricsByDate = {};
		var predictionMetricsPerSecurity = {};
		var predictionMetrics = null;

		allPredictions.forEach(item => {
			var security = item.security;
			var endDate = item.endDate;

			let dateStr = DateHelper.formatDate(endDate);
			
			if (dateStr in predictionMetricsByDate) {
				predictionMetricsByDate[dateStr] = _updateMetrics(predictionMetricsByDate[dateStr], prediction);
			} else {
				predcitionMerticsByDate[dateStr] = _initializeMetrics(prediction);
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
	const date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	//Get al entries started on a date
	return Promise.all([
		_computeContestWinners(date),
		_computeContestPredictionMetrics(date)
	])
	.then(([winners, preditionMetrics]) => {
		var predictionMetricsBySecurity = predictionMetrics.predictionMetricsBySecurity;
		var metricsArray = Object.keys(predictionMetricsBySecurity)
						.map(item => {return {ticker: item, metrics: predictionMetricsBySecurity[item]}});
		
		var topStocksUsers = metricsArray.sort((a,b) => {
			return a.numUsers.total > b.numUsers.total ? -1 : 1
		}).slice(0, 5);

		var topStocksInvestment = metricsArray.sort((a,b) => {
			return a.investment.total > b.investment.total ? -1 : 1
		}).slice(0, 5);

		var topStocks = {byUsers: topStocksUsers, byInvesment: topStocsInvestmnet};

		return DailyContestStatsModel.updateContestStats(date, {winners, predictionMetrics, topStocks});
	});
};

module.exports.updateContestTopStocks = function(date) {
	const date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	//Get al entries started on a date
	return _computeContestPredictionMetrics(date)
	.then(preditionMetrics => {
		var predictionMetricsBySecurity = predictionMetrics.predictionMetricsBySecurity;
		var metricsArray = Object.keys(predictionMetricsBySecurity)
						.map(item => {return {ticker: item, metrics: predictionMetricsBySecurity[item]}});
		
		var topStocksUsers = metricsArray.sort((a,b) => {
			return a.numUsers.total > b.numUsers.total ? -1 : 1
		}).slice(0, 5);

		var topStocksInvestment = metricsArray.sort((a,b) => {
			return a.investment.total > b.investment.total ? -1 : 1
		}).slice(0, 5);

		var topStocks = {byUsers: topStocksUsers, byInvesment: topStocsInvestmnet};

		return DailyContestStatsModel.updateContestStats(date, {predictionMetrics, topStocks});
	});
};
