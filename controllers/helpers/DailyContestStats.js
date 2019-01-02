/*
* @Author: Shiv Chawla
* @Date:   2018-10-29 15:21:17
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-01-02 15:19:51
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

const MIN_DAILY_PCT_CHANGE = 0.005;
const MIN_WEEKLY_PCT_CHANGE = 0.01;
const MIN_MONTHLY_PCT_CHANGE = 0.01;

const DAILY_PRIZES = [100, 75, 50];
const WEEKLY_PRIZES = [500, 300, 200];

function _computeDailyContestWinners(date) {
	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(allAdvisors => {
		return Promise.mapSeries(allAdvisors, function(advisorId) {
			
            return DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date)
			.then(pnlStatsForAdvisor => {
				var allPredictionsPnlStats =  _.get(pnlStatsForAdvisor, 'detail.cumulative.all.portfolio.net', {});
				
				var pnlPct = _.get(allPredictionsPnlStats, 'pnlPct', 0);
				var cost = _.get(allPredictionsPnlStats, 'cost', 0);
				var profitFactor = _.get(allPredictionsPnlStats, 'profitFactor', 0);
				var pnl = _.get(allPredictionsPnlStats, 'pnl', 0);

				return Object.assign({advisor: advisorId}, {pnlStats: {pnlPct, pnl, profitFactor, cost}});
			})
		})
		.then(pnlStatsForAllAdvisors => {
			return pnlStatsForAllAdvisors
			.filter(item => {return item.pnlStats.pnlPct > MIN_DAILY_PCT_CHANGE})			
			.sort((a,b) => {return a.pnlStats.pnlPct > b.pnlStats.pnlPct ? -1 : 1})
			.slice(0, DAILY_PRIZES.length)
			.map((item, index) => {item.rank = index+1; return item;});
		});
	})
}

function _computeWeeklyContestWinners(date) {
	if (DateHelper.isEndOfWeek(date)) {
		
		var endOfLastWeek = DateHelper.getEndOfLastWeek(date);

		return DailyContestEntryModel.fetchDistinctAdvisors()
		.then(allAdvisors => {
			return Promise.mapSeries(allAdvisors, function(advisorId) {
				
				return Promise.all([
					DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId}, date),
					DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId}, endOfLastWeek)
				])
				.then(([portfolioStatsToday, portfolioStatsLastWeek]) => {

					var netTotalToday = _.get(portfolioStatsToday, 'netTotal', 0.0);
					var netTotalLastWeek = _.get(portfolioStatsLastWeek, 'netTotal', 1000.0);
					var cash = _.get(portfolioStatsToday, 'cash', 0)

					var pnlPct = netTotalLastWeek > 0 ?  (netTotalToday/netTotalLastWeek) - 1 : 0;
					var pnl = netTotalToday - netTotalLastWeek;

					return Object.assign({advisor: advisorId}, {pnlStats: {pnlPct, pnl, netTotal: netTotalToday, netTotalLastWeek, cash}});
				})
			})
			.then(pnlStatsForAllAdvisors => {
				return pnlStatsForAllAdvisors
				.filter(item => {return item.pnlStats.pnlPct > MIN_WEEKLY_PCT_CHANGE})			
				.sort((a,b) => {return a.pnlStats.pnlPct > b.pnlStats.total.pnlPct ? -1 : 1})
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

		return DailyContestEntryModel.fetchDistinctAdvisors()
		.then(allAdvisors => {
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

function _updateEarningStats(winners, date, category) {
	return DailyContestEntryModel.fetchDistinctAdvisors({})
	.then(allAdvisors => {
		return Promise.mapSeries(allAdvisors, function(advisorId) {
			let winAmount = 0;

			var idx = winners.map(item => item.advisor).indexOf(advisorId);
			if (idx != -1) { 
				var allPrizes = category == "daily" ? DAILY_PRIZES : WEEKLY_PRIZES;
				winAmount = allPrizes.length >= winners[idx].rank ? allPrizes[winner.rank - 1] : 0;
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
			_updateEarningStats(dailyWinners || [], date,  "daily"),
			_updateEarningStats(weeklyWinners || [], date, "weekly")
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
	return DailyContestEntryModel.fetchDistinctAdvisors({})
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

module.exports.sendDailyWinnerDigest = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date).toDate();

	return DailyContestStatsModel.fetchContestStats(date, {fields: 'topStocks dailyWinners'})
	.then(contestStats => {
		if (contestStats) {
			var winners = contestStats.dailyWinners;
			
			var leaderboardUrl = `${config.get('hostname')}/dailycontest/leaderboard?date=${moment(date).format("YYYY-MM-DD")}`;
			var submitPredictionUrl = `${config.get('hostname')}/dailycontest/stockpredictions`;

			return Promise.mapSeries(winners, function(winner) {
				let winnerDigest = {leaderboardUrl, submitPredictionUrl,
					pnlPct: `${(_.get(winner,'pnlStats.total.pnlPct')*100).toFixed(2)}%`, 
					rank: winner.rank,
					prizeMoney: winner.rank <= DAILY_PRIZES.length ? DAILY_PRIZES[winner.rank - 1] : 0,
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






