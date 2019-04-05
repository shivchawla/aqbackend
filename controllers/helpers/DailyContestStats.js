/*
* @Author: Shiv Chawla
* @Date:   2018-10-29 15:21:17
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-05 20:52:15
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');
const config = require('config');
var path = require('path');
var fs = require('fs');
var csv = require('fast-csv');

const DateHelper = require('../../utils/Date');
const DailyContestEntryHelper = require('./DailyContestEntry');
const WSHelper = require('./WSHelper');
const sendEmail = require('../../email');
const APIError = require('../../utils/error');

const UserModel = require('../../models/user');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');

const MIN_DAILY_PCT_CHANGE = 0.005;
const MIN_WEEKLY_PCT_CHANGE = 0.01;
const MIN_MONTHLY_PCT_CHANGE = 0.01;
const MIN_WEEKLY_ACTIVE_DAYS = 3;

const MIN_DAILY_UNIQ_PREDICTIONS = 3;

const DAILY_PRIZES_OLD = [100, 100, 100, 100, 100];
const DAILY_PRIZES = [100, 75, 50];
const WEEKLY_PRIZES = [500, 300, 200];


function _getWeeklyPrizes(date) {
	return WEEKLY_PRIZES;
}

function _getDailyPrizes(date) {
	if (DateHelper.getMarketCloseDateTime(date).isAfter(DateHelper.getMarketCloseDateTime("2018-12-31"))) {
		return DAILY_PRIZES;
	} else {
		return DAILY_PRIZES_OLD;
	}
}

function _formatInvestmentValue(value) {
	if (value && typeof(value) == "number"){
		var valueLac = value/100;
		var valueCr = value/10000;
		var roundVal = value - Math.floor(value) > 0; 
		var roundLacs = valueLac - Math.floor(valueLac) > 0;
		var roundCrs = valueCr - Math.floor(valueCr) > 0;

		return valueLac >= 1.0 ?  
			valueCr >= 1.0 ? 
			(roundCrs > 0 ? `${(valueCr).toFixed(2)}Cr` : `${valueCr.toFixed(0)}Cr`) : 
		 	(roundLacs ? `${valueLac.toFixed(2)}L` : `${valueLac.toFixed(0)}L`) : 
			(roundVal ? `${value.toFixed(2)}K` : `${value.toFixed(0)}K`);
	} else{
		return value;
	}
}

function _getUniqueMasterAdvisorWithContestEntries() {
	return Promise.all([
		AdvisorModel.fetchDistinctAdvisors({isMasterAdvisor: true}),
		DailyContestEntryModel.fetchDistinctAdvisors()
	])
	.then(([masterAdvisors, advisorsWithContestEntry]) => {
		return _.intersection(masterAdvisors.map(item => item.toString()), advisorsWithContestEntry.map(item => item.toString()));	
	})
}

function _computeDailyContestWinners(date) {

	return _getUniqueMasterAdvisorWithContestEntries()
	.then(distinctAdvisors => {

		return Promise.mapSeries(distinctAdvisors, function(advisorId) {
			
            return Promise.all([
            	DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date),
            	DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {priceUpdate: false, category: "all"})
        	])
			.then(([pnlStatsForAdvisor, allPredictions]) => {
				var allPredictionsPnlStats =  _.get(pnlStatsForAdvisor, 'detail.daily.all.net', {});
				
				var pnlPct = _.get(allPredictionsPnlStats, 'pnlPct', 0);
				var cost = _.get(allPredictionsPnlStats, 'cost', 0);
				var profitFactor = _.get(allPredictionsPnlStats, 'profitFactor', 0);
				var pnl = _.get(allPredictionsPnlStats, 'pnl', 0);

				var uniquePredictions = _.uniq(allPredictions.map(item => _.get(item, 'position.security.ticker', ""))).length; 

				return Object.assign({advisor: advisorId}, {pnlStats: {pnlPct, pnl, profitFactor, cost, uniquePredictions}});
			})
		})
		.then(pnlStatsForAllAdvisors => {
			return pnlStatsForAllAdvisors
			.filter(item => {return item.pnlStats.pnlPct > MIN_DAILY_PCT_CHANGE && item.pnlStats.uniquePredictions >= MIN_DAILY_UNIQ_PREDICTIONS})			
			.sort((a,b) => {return a.pnlStats.pnlPct > b.pnlStats.pnlPct ? -1 : 1})
			.slice(0, _getDailyPrizes(date).length)
			.map((item, index) => {item.rank = index+1; return item;});
		});
	})
}

function _computeWeeklyContestWinners(date) {
	if (DateHelper.isEndOfWeek(date)) {
		
		var endOfLastWeek = DateHelper.getEndOfLastWeek(date);
		var tradingDates = DateHelper.getTradingDates(endOfLastWeek, DateHelper.getDate(), false);

		return _getUniqueMasterAdvisorWithContestEntries()
		.then(distinctAdvisors => {

			return Promise.mapSeries(distinctAdvisors, function(advisorId) {
				
				return Promise.all([
					DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId}, date),
					DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId}, endOfLastWeek),
					Promise.mapSeries(tradingDates, function(date){
						return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {priceUpdate: false, category: "all"}).then(p => {return p.length});
					})
				])
				.then(([portfolioStatsToday, portfolioStatsLastWeek, predictionCountPerDate]) => {

					var activePredictionDateCount = predictionCountPerDate.filter(item => {return item > 0}).length;

					var netTotalToday = _.get(portfolioStatsToday, 'netTotal', 0.0);
					var netTotalLastWeek = _.get(portfolioStatsLastWeek, 'netTotal', 1000.0);
					var cash = _.get(portfolioStatsToday, 'cash', 0)

					var pnlPct = netTotalLastWeek > 0 ?  (netTotalToday/netTotalLastWeek) - 1 : 0;
					var pnl = netTotalToday - netTotalLastWeek;

					return Object.assign({advisor: advisorId}, {pnlStats: {pnlPct, pnl, netTotal: netTotalToday, netTotalLastWeek, cash, activeDays: activePredictionDateCount}});
				})
			})
			.then(pnlStatsForAllAdvisors => {
				return pnlStatsForAllAdvisors
				.filter(item => {
					return item.pnlStats.pnlPct > MIN_WEEKLY_PCT_CHANGE && 
						item.pnlStats.activeDays > MIN_WEEKLY_ACTIVE_DAYS &&
						item.pnlStats.netTotal > 1000 &&
						item.pnlStats.netTotalLastWeek >= 1000;
				})			
				.sort((a,b) => {return a.pnlStats.pnlPct > b.pnlStats.pnlPct ? -1 : 1})
				.slice(0, WEEKLY_PRIZES.length)
				.map((item, index) => {item.rank = index+1; return item;});
			});
		})
	} else {
		return null;
	}
}

/*
* THIS CALCULATES MONTHLY PAYOUT TO THE PARTICIPANTS (NEEDS A LOT OF WORK)
*/
function _computeMonthlyPayout(date) {
	if (DateHelper.isEndOfMonth(date)) {
		
		var endOfLastMonth = DateHelper.getEndOfLastMonth(date);

		return _getUniqueMasterAdvisorWithContestEntries()
		.then(distinctAdvisors => {
			
			return Promise.mapSeries(allAdvisors, function(advisorId) {
				
				return Promise.all([
					DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId}, date),
					DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId}, endOfLastMonth)
				])
				.then(([portfolioStatsToday, portfolioStatsLastMonth]) => {

					var netTotalToday = _.get(portfolioStatsToday, 'netTotal', 0.0);
					var netTotalLastMonth = _.get(portfolioStatsLastMonth, 'netTotal', 0.0);
					var cash = _.get(portfolioStatsToday, 'cash', 0)

					//var maxNetTotalTillLastMonth = _.get(portfolioStatsLastMonth, 'maxNetTotal', 0.0); 
					
					//THis is tricky.....highwater mark is calulated using the payout NAV (and not the max NAV)
					//var isHigherThanHighWaterMark = netTotalToday > maxNetTotalTillLastMonth;
					
					var pnlPct = netTotalLastMonth > 0 ?  (netTotalToday/netTotalLastMonth) - 1 : 0;
					var pnl = netTotalToday - netTotalLastMonth;

					//HERE WE NEED TO WRITE LOGIC TO COMPUTE THE REWARD MONEY BASED ON PNL
					//HERE WE NEED TO COMPUTE BETA ADJUSTED RETURNS
					//What's the investment value if I invested 10Lacs in NIFTY_50 at the start of the Year? 10.1Lacs
					//What's my investment value = 10.2Lac
					//My Beta = 0.5, Gain because of skill = 0.2 - max(0.5*0.1, 1% p.m) = 0.15Lac
					//Profit Share = 10%
					//Profit = 0.1*15000 = Rs. 1500
					//Already Payout = Rs. 1000 (at end of month 1)
					//Net Payout = Rs. 500

					return Object.assign({advisor: advisorId}, {pnlStats: {pnlPct, pnl, netTotal: netTotalToday, netTotalLastMonth, cash}});
				})
			})
			.then(pnlStatsForAllAdvisors => {
				return pnlStatsForAllAdvisors
				.filter(item => {return item.pnlStats.pnlPct > MIN_MONTHLY_PCT_CHANGE && item.isHigherThanHighWaterMark})			
				.sort((a,b) => {return a.pnlStats.pnlPct > b.pnlStats.pnlPct ? -1 : 1})
				.map((item, index) => {item.rank = index+1; return item;});
			});
		})
	} else {
		return null
	}
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

	return _getUniqueMasterAdvisorWithContestEntries()
	.then(distinctAdvisors => {
		return Promise.mapSeries(distinctAdvisors, function(advisorId) {
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "started"})
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

module.exports.updateEarningStats = function(winners, date, category) {
	return _getUniqueMasterAdvisorWithContestEntries()
	.then(distinctAdvisors => {
		return Promise.mapSeries(distinctAdvisors, function(advisorId) {
			let winAmount = 0;

			var idx = winners.map(item => item.advisor.toString()).indexOf(advisorId.toString());
			if (idx != -1) { 
				var allPrizes = category == "daily" ? _getDailyPrizes(date) : _getWeeklyPrizes(date);
				var winner = winners[idx];
				winAmount = allPrizes.length >= winner.rank ? allPrizes[winner.rank - 1] : 0;
			}

			return DailyContestEntryPerformanceModel.updateEarningStats({advisor: advisorId}, date, {earnings: winAmount, category});
		});
	});
}

module.exports.updateContestStats = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	//Get al entries started on a date
	return Promise.all([
		_computeDailyContestWinners(date),
		_computeWeeklyContestWinners(date),
		_computeContestPredictionMetrics(date)
	])
	.then(([dailyWinners, weeklyWinners, predictionMetrics]) => {
		var predictionMetricsBySecurity = predictionMetrics.bySecurity;
		var metricsArray = Object.keys(predictionMetricsBySecurity)
						.map(item => {return {ticker: item, ...predictionMetricsBySecurity[item]}});
		
		var topStocksUsers = metricsArray.sort((a,b) => {
			return a.numUsers.total > b.numUsers.total ? -1 : 1
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocksInvestment = metricsArray.sort((a,b) => {
			return a.investment.gross > b.investment.gross ? -1 : 1
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocks = {byUsers: topStocksUsers, byInvestment: topStocksInvestment};

		return Promise.all([
			DailyContestStatsModel.updateContestStats(date, {dailyWinners, weeklyWinners, predictionMetrics, topStocks}),
			exports.updateEarningStats(dailyWinners || [], date,  "daily"),
			exports.updateEarningStats(weeklyWinners || [], date, "weekly")
		])
	})
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
			return a.investment.gross > b.investment.gross ? -1 : 1
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocks = {byUsers: topStocksUsers, byInvestment: topStocksInvestment};

		return DailyContestStatsModel.updateContestStats(date, {predictionMetrics, topStocks});
	});
};

function _computeWinnerDigest(winners) {
	return Promise.mapSeries(winners, function(winner) {
		const winnerAdvisorId = winner.advisor;

		return AdvisorModel.fetchAdvisor({_id: winnerAdvisorId}, {fields: 'user'})
		.then(advisor => {
          return {winnerName: `${advisor.user.firstName} ${advisor.user.lastName}`, pnlPct:_.get(winner,'pnlStats.total.pnlPct',0)};               
		})
	})
	.then(winnerStats => {
		let winnerDigest = {};

		winnerStats.forEach((item, index) => {

			var winnerKey = `winner${index+1}`;
			var pnlKey = `pnlPct${index+1}`;
			winnerDigest = Object.assign(winnerDigest, {
				[winnerKey]: item.winnerName, 
				[pnlKey]: `${(item.pnlPct*100).toFixed(2)}%`
			});
		});

		return winnerDigest;
	})
}


function _getUserDetail(advisorId) {
	return AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: 'user'})
	.then(advisor => {
		return UserModel.fetchUser({_id: advisor.user._id}, {fields:'firstName lastName email code emailpreference'})
	})
	.then(user => {
        return user.toObject();
	});
}

function _getContestDigest(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date).toDate();
	return DailyContestStatsModel.fetchContestStats(date, {fields: 'topStocks winners'})
	.then(contestStats => {
		if (contestStats) {
			var winners = _.get(contestStats, 'winners', []).slice(0,2);
			var topStocks = _.get(contestStats,'topStocks.byUsers', []).slice(0, 2);

			var leaderboardUrl = `${config.get('hostname')}/dailycontest/leaderboard?date=${moment(date).format("YYYY-MM-DD")}`;
			var topStocksUrl = `${config.get('hostname')}/dailycontest/toppicks?date=${moment(date).format("YYYY-MM-DD")}`;
			var submitPredictionUrl = `${config.get('hostname')}/dailycontest/stockpredictions`;

			var summaryDigest = {leaderboardUrl, topStocksUrl, submitPredictionUrl, dailyContestDate: moment(date).format("Do MMM YYYY")};		

			return _computeWinnerDigest(winners)
			.then(winnerDigest => {

				let topStocksDigest = {};
				topStocks.forEach((item, index) => {
					var stockKey = `stock${index+1}`;
					var votesKey = `votes${index+1}`;
					//var investmentKey = `investment${index+1}`;

					topStocksDigest = Object.assign(topStocksDigest, {
						[stockKey]: item.ticker, 
						[votesKey]: item.numUsers.total,
						//[investmentKey]: `${item.investment.gross}K`
					});
				});

			  	return {...summaryDigest, ...winnerDigest, ...topStocksDigest, 
	               	hiddenTopstocks: topStocks.length == 0 ? "hidden" : "",
					hiddenStock2: topStocks.length==1 ? "hidden" : "",
                    hiddenWinners: winners.length == 0 ? "hidden" : "",
                    hiddenWinner2: winners.length == 1 ? "hidden" : ""}
			})
		} else {
			throw new Error(`Summary Digest Error! No contest stats found for ${date}`);
		}
	})
}

function _getAdvisorPerformanceDigest(advisorId, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date).toDate();

	return DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date)
	.then(pnlStats => {
        const advisorDigest = {
        	allPredictions: _.get(pnlStats, 'detail.cumulative.all.portfolio.net.count', 0),
        	dailyPnl: `${(_.get(pnlStats, 'detail.daily.all.net.pnlPct', 0)*100).toFixed(2)}%`,
        	totalPnl: `${(_.get(pnlStats, 'detail.cumulative.all.portfolio.net.pnlPct', 0)*100).toFixed(2)}%`
    	}

    	return advisorDigest;
	});
}

function _getAdvisorLatestPerformance(advisorId) {
	return DailyContestEntryPerformanceModel.fetchLatestPnlStats({advisor: advisorId})
	.then(pnlStats => {
        const latestAdvisorPnlStats = {
        	totalPredictions: _.get(pnlStats, 'net.all.net.count', 0),
        	winRatio: _.get(pnlStats, 'net.all.net.winRatio', 0),
    	}

    	return latestAdvisorPnlStats;
	});
}

function _getContestAdvisors(options) {
	return _getUniqueMasterAdvisorWithContestEntries()
	.then(distinctAdvisors => {
		var successRateMin = _.get(options, 'winRatioMin', 0);
		var successRateMax = _.get(options, 'winRatioMax', 1.0);
		var allPredictionsMin = _.get(options, 'allPredictionsMin', 0);
		var allPredictionsMax = _.get(options, 'allPredictionsMax', Infinity);

		return Promise.map(distinctAdvisors, function(advisorId) {
			return DailyContestEntryPerformanceModel.fetchLatestPnlStats({advisor: advisorId})
			.then(pnlStats => {
				if (pnlStats) {
					const winRatio = _.get(pnlStats, 'net.all.net.winRatio', 0) || 0;
					const successRate = winRatio > 0 ? winRatio/(1+winRatio) : 1.0;

					const allPredictions = _.get(pnlStats, 'detail.cumulative.all.portfolio.net.count', 0);
					const totalPredictions = _.get(pnlStats, 'net.all.net.count', 0);

					if (successRate >= successRateMin && successRate <= successRateMax &&
							allPredictions >= allPredictionsMin && allPredictions <= allPredictionsMax) {
						return {successRate, allPredictions, totalPredictions, advisorId};
					} else {
						return null;
					}

				} else {
					return null;
				}
			})
		})
		.then(filteredAdvisors => {
			return filteredAdvisors.filter(item => item);
		});		
	});
}

function _getPortfolioSummary(advisorId) {
	return Promise.all([
		DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId}),
		DailyContestEntryPerformanceModel.fetchLastPortfolioStats({advisor: advisorId}),
		DailyContestEntryPerformanceModel.fetchLatestPnlStats({advisor: advisorId}),
	])
	.then(([latestPortfolioStats, lastPortfolioStats, latestPnlStats]) => {
		var numActivePredictions = _.get(latestPortfolioStats, 'numPredictions', 0);
		if (numActivePredictions == 0) {
			return null;
		} else {
			var dailyPnl = _.get(latestPnlStats, 'detail.daily.all.net.pnl', 0);

			var lastNAV = _.get(lastPortfolioStats, 'netTotal', 1000);
			var dailyReturn = `${(dailyPnl*100/lastNAV).toFixed(2)}%`;
			var latestNAV = _.get(latestPortfolioStats, 'netTotal', 1000) || 1000;

			var totalReturn = `${((latestNAV - 1000)*100/latestNAV).toFixed(2)}%`;

			return {netValue: _formatInvestmentValue(latestNAV), totalReturn, dailyReturn};
		} 
	});
}

module.exports.sendTemplateEmailToParticipants = function(emailType) {	
	
	let templateId;

	Promise.resolve()
	.then(() => {
		switch(emailType) {
			case "all": 
				templateId = config.get('dailycontest_all_advisors_template'); 
				return _getContestAdvisors(); 
				break;

			case "zeroPredictions": 
				templateId = config.get('dailycontest_zero_predictions_advisors_template'); 
				return _getContestAdvisors({allPredictionsMax: 0});
				break;

			case "lowProfitabilityLowPredictions": 
				templateId = config.get('dailycontest_low_profitability_low_predictions_advisors_template'); 
				return _getContestAdvisors({allPredictionsMin: 1, allPredictionsMax: 5, successRateMax: 0.5});
				break;	

			case "highProfitabilityLowPredictions": 
				templateId = config.get('dailycontest_high_profitability_low_predictions_advisors_template'); 
				return _getContestAdvisors({allPredictionsMin: 1, allPredictionsMax: 5, successRateMin: 0.5});
				break;

			case "lowProfitabilityHighPredictions": 
				templateId = config.get('dailycontest_low_profitability_high_predictions_advisors_template'); 
				return _getContestAdvisors({allPredictionsMin: 5, successRateMax: 0.5});
				break;

			case "highProfitabilityHighPredictions": 
				templateId = config.get('dailycontest_high_profitability_high_predictions_advisors_template'); 
				return _getContestAdvisors({allPredictionsMin: 5, successRateMin: 0.5});
				break;

			default: templateId = config.get('dailycontest_all_advisors_template'); return _getContestAdvisors(); break;
		}
	})
	.then(filteredAdvisorsWithDetail => {
		return Promise.mapSeries(filteredAdvisorsWithDetail, function(item) {
			let advisorId = item.advisorId;
			
			var submitPredictionUrl = `${config.get('hostname')}/dailycontest/stockpredictions`;
			const motivationDigest = {requiredPredictions: 30, requiredProfitability: 60, requiredAvgReturn:1.5, ...item, submitPredictionUrl};
			
			return _getUserDetail(advisorId)
			.then(userDetail => {

				const code = userDetail.code;
        		const type = "marketing_digest";
        		const email = userDetail.email;
        		const sendDigest = _.get(userDetail, `emailpreference.${type}`, true);        
        		const unsubscribeUrl = eval('`'+config.get('request_unsubscribe_url') +'`');

        		if (sendDigest) {
		            if (process.env.NODE_ENV === 'production') {	
		            	return sendEmail.sendTemplateEmail(templateId, {...motivationDigest, unsubscribeUrl}, userDetail, "contest");
		        	
		        	} else if(process.env.NODE_ENV === 'development') {
		                return sendEmail.sendTemplateEmail(templateId, motivationDigest, 
		                    {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"}, "contest");
		            }
	            }
            });
        })
    })
};

module.exports.sendSummaryDigest = function(date) {	
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date).toDate();

	return _getUniqueMasterAdvisorWithContestEntries()
	.then(distinctAdvisors => {

		let sent = false;
		return Promise.mapSeries(distinctAdvisors, function(advisorId) {

			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {priceUpdate: false, category: "all"})
			.then(predictions => {
				if (predictions.length > 0) {
					return Promise.all([
						_getAdvisorPerformanceDigest(advisorId, date),
						_getContestDigest(date),
						_getUserDetail(advisorId, "daily_performance_digest"),
						_getPortfolioSummary(advisorId)
					])
					.then(([advisorDigest, contestDigest, userDetail, portfolioSummary]) => {

						if (portfolioSummary) {
							const code = userDetail.code;
			        		const type = "daily_performance_digest";
			        		const email = userDetail.email;
			        		const sendDigest = _.get(userDetail, 'emailpreference.daily_performance_digest', true);        
			        		const unsubscribeUrl = eval('`'+config.get('request_unsubscribe_url') +'`');

							const fullDigest = {...advisorDigest, ...contestDigest, ...portfolioSummary, unsubscribeUrl};

				            if (process.env.NODE_ENV === 'production') {	
				            	
				            	return sendEmail.sendDailyContestSummaryDigest(fullDigest, userDetail);
				        	
				        	} else if(process.env.NODE_ENV === 'development') {
				                
				                return sendEmail.sendDailyContestSummaryDigest(fullDigest, 
				                    {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
				            }
			            }
		            })
	            }
            })
        })
    })
};

module.exports.sendDailyWinnerDigest = function(date, weekly = false) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date).toDate();

	return DailyContestStatsModel.fetchContestStats(date, {fields: 'topStocks dailyWinners weeklyWinners'})
	.then(contestStats => {
		if (contestStats) {
			var winners = weekly ? contestStats.weeklyWinners : contestStats.dailyWinners;
			
			var leaderboardUrl = `${config.get('hostname')}/dailycontest/leaderboard?date=${moment(date).format("YYYY-MM-DD")}`;
			var submitPredictionUrl = `${config.get('hostname')}/dailycontest/stockpredictions`;

			var prizesForDate = weekly ? _getWeeklyPrizes(date) : _getDailyPrizes(date);

			return Promise.mapSeries(winners, function(winner) {
				let winnerDigest = {leaderboardUrl, submitPredictionUrl,
					pnlPct: `${(_.get(winner,'pnlStats.pnlPct')*100).toFixed(2)}%`, 
					rank: winner.rank,
					prizeMoney: winner.rank <= prizesForDate.length ? prizesForDate[winner.rank - 1] : 0,
					dailyContestDate: moment(date).format("Do MMM YYYY")};
				
				return _getUserDetail(winner.advisor)
                .then(user => {
                
                    if (process.env.NODE_ENV === 'production') {
                    	return sendEmail.sendDailyContestWinnerEmail(winnerDigest, user, weekly);
                	
                	} else if(process.env.NODE_ENV === 'development') {
                        return sendEmail.sendDailyContestWinnerEmail(winnerDigest, 
                            {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"}, weekly);
                    }
                });
            })
			
		} else {
			APIError.throwJsonError({message: `Winner Digest Error! No contest stats found for ${date}`});
		}
	});
};


module.exports.formatWinnerFormat = function() {
	const dates = ["2018-11-12","2018-11-13","2018-11-14","2018-11-15", "2018-11-16", 
	"2018-11-19","2018-11-20","2018-11-21", "2018-11-22", 
	"2018-11-26","2018-11-27","2018-11-28", "2018-11-29", "2018-11-30",
	"2018-12-03","2018-12-04","2018-12-05", "2018-12-06", "2018-12-07", 
	"2018-12-10","2018-12-11", "2018-12-12", "2018-12-13", "2018-12-14", 
    "2018-12-17", "2018-12-18", "2018-12-19", "2018-12-20", "2018-12-21", 
    "2018-12-24", "2018-12-26", "2018-12-27", "2018-12-28", "2018-12-31"];
	
	return Promise.mapSeries(dates, function(date) {
		date = DateHelper.getMarketCloseDateTime(date);

		return DailyContestStatsModel.fetchContestStats(date, {fields: 'winners'})
		.then(contestStats => {
			if (contestStats) {
				var dailyWinners = _.get(contestStats.toObject(), 'winners', null);

				if (dailyWinners) {
					//Update the winner to dailyWinners
					//and update pnlStats

					dailyWinners.forEach((winner, idx) => {
						var pnlStats = _.get(winner, 'pnlStats.total', null);
						dailyWinners[idx].pnlStats = pnlStats;
					})

					return DailyContestStatsModel.updateContestStats(date, {dailyWinners})
				}
			}
		})	
	})
};

module.exports.updateDailyContestOverallWinnersByEarnings = function(filePath = null) {
	filePath = filePath !== null 
		? filePath 
		: `${path.dirname(require.main.filename)}/examples/winners.csv`;

	return _getUniqueMasterAdvisorWithContestEntries()
	.then(distinctAdvisors => {
		return Promise.all([
			DailyContestEntryPerformanceModel.fetchDistinctPerformances({advisor:{$in: distinctAdvisors}}),
			UserModel.fetchUsers({email: {$in: config.get('winners_not_allowed')}}, {_id: 1})
		])
	})
	.then(([performances, usersNotAllowed]) => {
		return Promise.mapSeries(performances,  function(performance) {

			// performance = performance.toObject();
			let userId = _.get(performance, 'advisor.user._id', "");
			if (usersNotAllowed.map(item => item._id.toString()).indexOf(userId.toString()) == -1) {
				let firstName = _.get(performance, 'advisor.user.firstName', '');
				let lastName = _.get(performance, 'advisor.user.lastName', '');
				firstName = firstName[0].toUpperCase() + firstName.slice(1).toLowerCase();
				lastName = lastName[0].toUpperCase() + lastName.slice(1).toLowerCase();
				const userName = `${firstName} ${lastName}`;
				const dailyEarnings = _.get(performance, 'totalDaily', 0);
				const weeklyEarnings = _.get(performance, 'totalWeekly', 0);
				const totalEarnings = dailyEarnings + weeklyEarnings;

				return {name: userName, dailyEarnings, weeklyEarnings, totalEarnings};

			} else {
				return null;
			}
		})
	})
	.then(winners => {
		winners = _.orderBy(winners.filter(item => item), 'totalEarnings', 'desc').slice(0, 10); 
		writeWinnersToCsv(filePath, winners);	
			// writeWinnersToCsv(`${filePath}/examples/winners.csv`, winners);
	})
	.catch(err => {
		console.log(err);
	})
}

const writeWinnersToCsv = (path, winners) => {
	const csvStream = csv
		.createWriteStream({headers: true})
		.transform(function(row, next){
			setImmediate(function(){
				// this should be same as the object structure
				next(null, {
					Name: row.name, 
					Earnings: row.totalEarnings
					// Daily: row.dailyEarnings, 
					// Weekly: row.weeklyEarnings
				});
			});;
		});
	const writableStream = fs.createWriteStream(path);		
	writableStream.on("finish", function(){
		console.log("Written to file");
	});
	csvStream.pipe(writableStream);
	winners.map(winner => {
		csvStream.write(winner);
	});
	csvStream.end();
}
