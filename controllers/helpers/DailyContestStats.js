/*
* @Author: Shiv Chawla
* @Date:   2018-10-29 15:21:17
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-04 12:54:19
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');
const config = require('config');

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

function _computeContestWinners(date) {
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(allAdvisors => {
		return Promise.mapSeries(allAdvisors, function(advisor) {
			let advisorId = advisor._id;
			return Promise.all([
				DailyContestEntryHelper.getTotalPnlStats(advisorId, date, "ended"),
				DailyContestEntryHelper.getTotalPnlStats(advisorId, date, "active")
			])
			.then(([pnlStatsEndedPredictionsForAdvisor, pnlStatsActivePredictionsForAdvisor]) => {
				var realizedPnl =  pnlStatsEndedPredictionsForAdvisor.all.net.pnl;
				var endedInvestment = pnlStatsEndedPredictionsForAdvisor.all.net.cost;
				var activeInvestment = pnlStatsActivePredictionsForAdvisor.all.net.cost;
				var totalInvestment = endedInvestment + activeInvestment;
				
				var pnlPct = totalInvestment > 0 ? realizedPnl/totalInvestment : 0;

				var profitFactor = pnlStatsEndedPredictionsForAdvisor.all.net.profitFactor;

				return Object.assign({advisor: advisorId}, {pnlStats: {total: {pnlPct, pnl: realizedPnl, profitFactor, cost: totalInvestment}}});
			})
		})
		.then(pnlStatsForAllAdvisors => {
			return pnlStatsForAllAdvisors
			.filter(item => {return item.pnlStats.total.pnlPct > 0})			
			.sort((a,b) => {return a.pnlStats.total.pnlPct > b.pnlStats.total.pnlPct ? -1 : 1})
			.slice(0, 5)
			.map((item, index) => {item.rank = index+1; return item;});
		});
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
	return AdvisorModel.fetchAdvisors({}, {fields:'_id'})
	.then(allAdvisors => {
		
		return Promise.mapSeries(allAdvisors, function(advisor) {
			var advisorId = advisor._id;
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, "started")
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

function _unTrackIntradayHistory() {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"untrack_stock_intraday_detail"});
        								
		WSHelper.handleMktRequest(msg, resolve, reject);

	});
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
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocksInvestment = metricsArray.sort((a,b) => {
			return a.investment.gross > b.investment.gross ? -1 : 1
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocks = {byUsers: topStocksUsers, byInvestment: topStocksInvestment};

		return DailyContestStatsModel.updateContestStats(date, {winners, predictionMetrics, topStocks});
	})
	.then(() => {
		return _unTrackIntradayHistory()
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
		const code = user.code;
        const type = "daily_performance_digest";
        const email = user.email;
        const sendDigest = _.get(user, 'emailpreference.daily_performance_digest', true);        
        const unsubscribeUrl = eval('`'+config.get('request_unsubscribe_url') +'`');
        return {...user, unsubscribeUrl};
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
        	activePredictions: _.get(pnlStats, 'detail.cumulative.active.all.net.count', 0),
        	dailyPnl: `${(_.get(pnlStats, 'detail.daily.active.net.pnlPct', 0)*100).toFixed(2)}%`,
        	totalPnl: `${(_.get(pnlStats, 'detail.cumulative.active.all.net.pnlPct', 0)*100).toFixed(2)}%`
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


module.exports.sendTemplateEmailToParticipants = function(templateId) {	
	
	return DailyContestEntryModel.fetchDistinctAdvisors({})
	.then(distinctAdvisors => {
		return Promise.mapSeries(distinctAdvisors, function(advisorId) {

			var submitPredictionUrl = `${config.get('hostname')}/dailycontest/stockpredictions`;
			const motivationDigest = {requiredPredictions: 30, requiredProfitability: 70, submitPredictionUrl};

            if (process.env.NODE_ENV === 'production') {	
            	return sendEmail.sendTemplateEmail(templateId, motivationDigest, userDetail, "contest");
        	
        	} else if(process.env.NODE_ENV === 'development') {
                return sendEmail.sendTemplateEmail(templateId, motivationDigest, 
                    {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"}, "contest");
            }
        })
    })
};

module.exports.sendSummaryDigest = function(date) {	
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date).toDate();

	return DailyContestEntryModel.fetchDistinctAdvisors({})
	.then(distinctAdvisors => {
		return Promise.mapSeries(distinctAdvisors, function(advisorId) {

			return Promise.all([
				_getAdvisorPerformanceDigest(advisorId, date),
				_getContestDigest(date),
				_getUserDetail(advisorId)
			])
			.then(([advisorDigest, contestDigest, userDetail]) => {

				const fullDigest = {...advisorDigest, ...contestDigest, unsubscribeUrl: _.get(userDetail, 'unsubscribeUrl', '')};

	            if (process.env.NODE_ENV === 'production') {	
	            	return sendEmail.sendDailyContestSummaryDigest(fullDigest, userDetail);
	        	
	        	} else if(process.env.NODE_ENV === 'development') {
	                return sendEmail.sendDailyContestSummaryDigest(fullDigest, 
	                    {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
	            }
            })
        })
    })
};

module.exports.sendWinnerDigest = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date).toDate();

	return DailyContestStatsModel.fetchContestStats(date, {fields: 'topStocks winners'})
	.then(contestStats => {
		if (contestStats) {
			var winners = contestStats.winners;
			
			var leaderboardUrl = `${config.get('hostname')}/dailycontest/leaderboard?date=${moment(date).format("YYYY-MM-DD")}`;
			var submitPredictionUrl = `${config.get('hostname')}/dailycontest/stockpredictions`;

			return Promise.mapSeries(winners, function(winner) {
				let winnerDigest = {leaderboardUrl, submitPredictionUrl,
					pnlPct: `${(_.get(winner,'pnlStats.total.pnlPct')*100).toFixed(2)}%`, 
					rank: winner.rank,
					dailyContestDate: moment(date).format("Do MMM YYYY")};
				
				return _getUserDetail(winner.advisor)
                .then(user => {
                
                    if (process.env.NODE_ENV === 'production') {
                    	return sendEmail.sendDailyContestWinnerEmail(winnerDigest, user);
                	
                	} else if(process.env.NODE_ENV === 'development') {
                        return sendEmail.sendDailyContestWinnerEmail(winnerDigest, 
                            {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
                    }
                });
            })
			
		} else {
			APIError.throwJsonError({msg: `Winner Digest Error! No contest stats found for ${date}`});
		}
	});
};


