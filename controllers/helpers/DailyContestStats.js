/*
* @Author: Shiv Chawla
* @Date:   2018-10-29 15:21:17
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-10 17:44:08
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
	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(allAdvisors => {
		return Promise.mapSeries(allAdvisors, function(advisor) {
			let advisorId = advisor._id;
			
			return DailyContestEntryPerformanceModel.fetchLatestPnlStats({advisor: advisorId})
			.then(pnlStatsForAdvisor => {

				//Winners are based on active pnl () and not realized
				//Active pnl 
				var activePnlStats =  _.get(pnlStatsForAdvisor, 'detail.cumulative.active.all.net', {});
	
				var pnlPct = _.get(activePnlStats, 'pnlPct', 0);
				var cost = _.get(activePnlStats, 'cost', 0);
				var profitFactor = _.get(activePnlStats, 'profitFactor', 0);
				var pnl = _.get(activePnlStats, 'pnl', 0);

				return Object.assign({advisor: advisorId}, {pnlStats: {total: {pnlPct, pnl, profitFactor, cost}}});
			})
		})
		.then(pnlStatsForAllAdvisors => {
			return pnlStatsForAllAdvisors
			.filter(item => {return item.pnlStats.total.pnlPct > 0.005})			
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
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {caegory: "started"})
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
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocksInvestment = metricsArray.sort((a,b) => {
			return a.investment.gross > b.investment.gross ? -1 : 1
		}).slice(0, 5).map((item, index) => {item.rank = index+1; return item;});

		var topStocks = {byUsers: topStocksUsers, byInvestment: topStocksInvestment};

		return DailyContestStatsModel.updateContestStats(date, {winners, predictionMetrics, topStocks});
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

function _getContestAdvisors(options) {
	return DailyContestEntryModel.fetchDistinctAdvisors({})
	.then(distinctAdvisors => {
		var successRateMin = _.get(options, 'winRatioMin', 0);
		var successRateMax = _.get(options, 'winRatioMax', 1.0);
		var activePredictionsMin = _.get(options, 'activePredictionsMin', 0);
		var activePredictionsMax = _.get(options, 'activePredictionsMax', Infinity);

		return Promise.map(distinctAdvisors, function(advisorId) {
			return DailyContestEntryPerformanceModel.fetchLatestPnlStats({advisor: advisorId})
			.then(pnlStats => {
				if (pnlStats) {
					const winRatio = _.get(pnlStats, 'net.all.net.winRatio', 0) || 0;
					const successRate = winRatio > 0 ? winRatio/(1+winRatio) : 1.0;

					const activePredictions = _.get(pnlStats, 'detail.cumulative.active.all.net.count', 0);
					const totalPredictions = _.get(pnlStats, 'net.all.net.count', 0);

					if (successRate >= successRateMin && successRate <= successRateMax &&
							activePredictions >= activePredictionsMin && activePredictions <= activePredictionsMax) {
						return {successRate, activePredictions, totalPredictions, advisorId};
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
				return _getContestAdvisors({activePredictionsMax: 0});
				break;

			case "lowProfitabilityLowPredictions": 
				templateId = config.get('dailycontest_low_profitability_low_predictions_advisors_template'); 
				return _getContestAdvisors({activePredictionsMin: 1, activePredictionsMax: 5, successRateMax: 0.5});
				break;	

			case "highProfitabilityLowPredictions": 
				templateId = config.get('dailycontest_high_profitability_low_predictions_advisors_template'); 
				return _getContestAdvisors({activePredictionsMin: 1, activePredictionsMax: 5, successRateMin: 0.5});
				break;

			case "lowProfitabilityHighPredictions": 
				templateId = config.get('dailycontest_low_profitability_high_predictions_advisors_template'); 
				return _getContestAdvisors({activePredictionsMin: 5, successRateMax: 0.5});
				break;

			case "highProfitabilityHighPredictions": 
				templateId = config.get('dailycontest_high_profitability_high_predictions_advisors_template'); 
				return _getContestAdvisors({activePredictionsMin: 5, successRateMin: 0.5});
				break;

			default: templateId = config.get('dailycontest_all_advisors_template'); return distinctAdvisors; break;
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

	            if (process.env.NODE_ENV === 'production') {	
	            	return sendEmail.sendTemplateEmail(templateId, {...motivationDigest, unsubscribeUrl}, userDetail, "contest");
	        	
	        	} else if(process.env.NODE_ENV === 'development') {
	                return sendEmail.sendTemplateEmail(templateId, motivationDigest, 
	                    {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"}, "contest");
	            }
            });
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
				_getUserDetail(advisorId, "daily_performance_digest")
			])
			.then(([advisorDigest, contestDigest, userDetail]) => {

				const code = userDetail.code;
        		const type = "daily_performance_digest";
        		const email = userDetail.email;
        		const sendDigest = _.get(userDetail, 'emailpreference.daily_performance_digest', true);        
        		const unsubscribeUrl = eval('`'+config.get('request_unsubscribe_url') +'`');

				const fullDigest = {...advisorDigest, ...contestDigest, unsubscribeUrl};

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


