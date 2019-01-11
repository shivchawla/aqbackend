/*
* @Author: Shiv Chawla
* @Date:   2019-01-04 09:50:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-01-11 20:33:53
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');
const schedule = require('node-schedule');
const config = require('config');

const uuid = require('node-uuid');
const hashUtil = require('../../utils/hashUtil');
const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');
const WSHelper = require('./WSHelper');
const SecurityHelper = require('./Security');
const AdvisorHelper = require('./Advisor');
const DailyContestEntryHelper = require('./DailyContestEntry');

const UserModel = require('../../models/user');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');

const serverPort = require('../../index').serverPort;

function resetIntervalPrices(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	
	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(distinctAdvisors => {
		return Promise.mapSeries(distinctAdvisors, function(advisorId){
			return exports.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false})
			.then(predictions => {
				return Promise.mapSeries(predictions, function(prediction){
					prediction.priceInterval = {lowPrice:Infinity, highPrice:-Infinity};
					return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction);
				});
			})
		})
	})
}

function updateUserJwtId(hash=false) {
	return UserModel.fetchUsers({},{_id:1}, {limit: 1000})
	.then(users => {
		return Promise.mapSeries(users, function(user) {
			return Promise.resolve()
			.then(() => {
				return hash ?  hashUtil.genHash(uuid.v4()) : (user.jwtId || 'jwtid'); 
			})
			.then(jwtId => {
				return UserModel.updateJwtId({_id: user._id}, jwtId);
			})
		});
	})
}

function checkSumAdvisorAccount(update=false) {
	
	var dates = ["2019-01-01", "2019-01-02", "2019-01-03", "2019-01-04", "2019-01-07", "2019-01-08"];
	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {

			var account = {cash: 1000, liquidCash: 1000, investment:0};
			
			return Promise.mapSeries(dates, (date, index) => {
				date = DateHelper.getMarketCloseDateTime(date);

				var totalInvestment = 0
				var pnl = 0;
				var cashUsed = 0;
				var grossEquity = 0;
				var netEquity = 0;

				return Promise.all([
					DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: true}),
					DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "ended", priceUpdate: false}),
					DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "started", priceUpdate: true}),
					DailyContestEntryHelper.getPortfolioStatsForDate(advisorId, date)
				])
				.then(([allPredictions, endedPredictions, startedPredictions, portfolioStats]) => {
					
					endedPredictions = endedPredictions.filter(prediction => {
						var stopLoss = _.get(prediction, 'status.stopLoss', false);
						var profitTarget = _.get(prediction, 'status.profitTarget', false);
						var expired = _.get(prediction, 'status.expired', false) || 
							(DateHelper.compareDates(date, DateHelper.getCurrentDate()) != 0 && !moment(DateHelper.getMarketCloseDateTime(prediction.endDate)).isAfter(date)) ||
							(DateHelper.compareDates(date, DateHelper.getCurrentDate()) == 0 && !moment(DateHelper.getMarketCloseDateTime(prediction.endDate)).isAfter(moment()));

						var manualExit = _.get(prediction, 'status.manualExit', false);

						return stopLoss || profitTarget || expired || manualExit;
					});


					allPredictions.forEach(prediction => {

						var avgPrice = _.get(prediction, 'position.avgPrice', 0);
						var lastPrice = _.get(prediction, 'position.lastPrice', 0);
						var investment = _.get(prediction, 'position.investment', 0);

						var equity = avgPrice > 0 && lastPrice > 0 ? investment*(lastPrice/avgPrice) : investment;

						if (index == 0) {
							totalInvestment += Math.abs(investment);
							cashUsed += investment;
						} else {
							if (startedPredictions.map(item => item._id.toString()).indexOf(prediction._id.toString()) != -1) {
								totalInvestment += Math.abs(investment);
								cashUsed += investment;
							}
						}

						if(endedPredictions.map(item => item._id.toString()).indexOf(prediction._id.toString()) == -1) {
							netEquity += equity; 
							grossEquity += Math.abs(equity);
						}

						if(endedPredictions.map(item => item._id.toString()).indexOf(prediction._id.toString()) != -1) {
							pnl += equity - investment;
							totalInvestment -= Math.abs(investment)
							cashUsed -= investment;
						}
					});

					var cash = account.cash - cashUsed + pnl; 
					var liquidCash = account.liquidCash - totalInvestment + pnl;
					var investment = account.investment + totalInvestment; 

					var netTotal = netEquity + cash;
					var grossTotal = grossEquity + cash;
					
					account = {cash, liquidCash, investment};

					//Check sum condition
					var cashDiff = Math.abs(account.cash - _.get(portfolioStats, 'cash', 1000));
					var liquidCashDiff = Math.abs(account.liquidCash - _.get(portfolioStats, 'liquidCash', 1000));
					var investmentDiff = Math.abs(account.investment - _.get(portfolioStats, 'investment', 0));

					if (cashDiff > 0.001 || liquidCashDiff > 0.001 || investmentDiff > 0.001) {
						console.log(`Checksum FAILED for Advisor: ${advisorId} on Date: ${date.toDate()}`);
						console.log(`CashDiff: ${cashDiff}`);
						console.log(`LiquidCashDiff: ${liquidCashDiff}`);
						console.log(`investmentDiff: ${investmentDiff}`);

						const updates = {
							...portfolioStats, ...account,
							netEquity, grossEquity, grossTotal, netTotal	
						};

						if(update) {
							return DailyContestEntryPerformanceModel.updatePortfolioStatsForDate({advisor: advisorId}, updates, date)
							.then(() => {
				                return DailyContestEntryHelper.updateAdvisorLatestPnlStats(advisorId, date);
				            })
				            .then(() => {
				                return DailyContestEntryHelper.updateAdvisorNetPnlStats(advisorId, date);                       
				            })
						}
					} 	
				})
			})
			.then(() => {
                if(update) {
                    return AdvisorModel.updateAdvisor({_id: advisorId}, {account})
                }
        	})
		})
	})
	.catch(err => {
		console.log(err);
	})
}

function checkPredictionDuplicates() {
	var dates = ["2019-01-01", "2019-01-02", "2019-01-03", "2019-01-04", "2019-01-07", "2019-01-08"];

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {

			return Promise.mapSeries(dates, (date, index) => {
				date = DateHelper.getMarketCloseDateTime(date);

				return DailyContestEntryModel.fetchEntryPredictionsOnDate({advisor: advisorId}, date)
				.then(allPredictions => {
					var predictionIds = allPredictions.map(item => item._id.toString());

					var uniqPredictionIds = _.uniq(predictionIds);

					var diff = Math.abs(uniqPredictionIds.length - predictionIds.length);
					if (diff > 0) {
						console.log(`${diff} duplicate predictions found for advisor: ${advisorId} and date: ${date}`)
						
						uniqPredictionIds.forEach(uniqId => {
							if (predictionIds.filter(id => {return id == uniqId;}).length > 1) {
								
								console.log(allPredictions
									.filter(item => { return item._id.toString() == uniqId;})
									.map(item => {
										return {
											pId: uniqId, 
											date: DateHelper.getMarketCloseDateTime(item.startDate)
										};
									})
								);
							}
						});
					}
					
				});

			});
		});
	})
}

if (config.get('jobsPort') === serverPort) {
	//checkPredictionDuplicates();
	//checkSumAdvisorAccount()
}





