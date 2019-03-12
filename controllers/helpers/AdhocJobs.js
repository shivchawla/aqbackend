/*
* @Author: Shiv Chawla
* @Date:   2019-01-04 09:50:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-12 19:35:41
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
			return exports.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false, active: null})
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
	
	var seedDate = DateHelper.getMarketCloseDateTime("2019-01-01");
	var lastDate = DateHelper.getMarketCloseDateTime();

	var tradingDates = DateHelper.getTradingDates(seedDate, lastDate);

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {

			var account = {cash: 1000, liquidCash: 1000, investment:0};
			
			return Promise.mapSeries(tradingDates, (date, index) => {
				date = DateHelper.getMarketCloseDateTime(date);

				var totalInvestment = 0
				var pnl = 0;
				var cashUsed = 0;
				var grossEquity = 0;
				var netEquity = 0;

				return Promise.all([
					DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: true, active: null}),
					DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "ended", priceUpdate: false, active: null}),
					DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "started", priceUpdate: true, active: null}),
					DailyContestEntryHelper.getPortfolioStatsForDate(advisorId, date)
				])
				.then(([allPredictions, endedPredictions, startedPredictions, portfolioStats]) => {
					
					endedPredictions = endedPredictions.filter(prediction => {
						var stopLoss = _.get(prediction, 'status.stopLoss', false) && moment(date).isSame(moment(prediction.status.date));
						var profitTarget = _.get(prediction, 'status.profitTarget', false) && moment(date).isSame(moment(prediction.status.date));
						var expired = _.get(prediction, 'status.expired', false) || 
							(DateHelper.compareDates(date, DateHelper.getCurrentDate()) != 0 && !moment(DateHelper.getMarketCloseDateTime(prediction.endDate)).isAfter(date)) ||
							(DateHelper.compareDates(date, DateHelper.getCurrentDate()) == 0 && !moment(DateHelper.getMarketCloseDateTime(prediction.endDate)).isAfter(moment()));

						var manualExit = _.get(prediction, 'status.manualExit', false) && moment(date).isSame(moment(prediction.status.date));

						return stopLoss || profitTarget || expired || manualExit;
					});


					allPredictions.forEach(prediction => {

						var avgPrice = _.get(prediction, 'position.avgPrice', 0);
						var lastPrice = _.get(prediction, 'position.lastPrice', 0);
						var investment = _.get(prediction, 'position.investment', 0);

						var effectiveStartDate = DateHelper.getMarketCloseDateTime(_.get(prediction, 'conditional', false) ? prediction.triggered.trueDate : prediction.startDate);

						var equity = investment;
						if (effectiveStartDate && !moment(effectiveStartDate).isAfter(date)) {
							equity = avgPrice > 0 && lastPrice > 0 ? investment*(lastPrice/avgPrice) : investment;	
						}

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
	var seedDate = DateHelper.getMarketCloseDateTime("2019-01-01");
	var lastDate = DateHelper.getMarketCloseDateTime();

	var tradingDates = DateHelper.getTradingDates(seedDate, lastDate);

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {

			return Promise.mapSeries(tradingDates, (date, index) => {
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

function fixCallPriceForPredictions(date) {

	date = DateHelper.getMarketCloseDateTime(date);
	return DailyContestEntryModel.fetchDistinctAdvisors({'predictions.startDate': date})
	.then(distinctAdvisors => {

		return Promise.mapSeries(distinctAdvisors, function(advisorId) {
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date)
			.then(predictions => {

				//Filter based on startdate
				predictions = predictions.filter(item => {return moment(item.startDate).isSame(date);})

				return Promise.mapSeries(predictions, function(prediction) {
					//Now for these predictions, re-populate the call price
					return SecurityHelper.getStockDetail(prediction.position.security, date)
					.then(securityDetail => {

						var closePrice = _.get(securityDetail, 'latestDetail.Close', 0);
						if (closePrice != 0) {
							prediction.position.avgPrice = closePrice;
							return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction);
						} else {
							var ticker = prediction.position.security.ticker;
							console.log(`Close price for ${ticker} on ${date} is ZERO!!! SKIPPING`);
						}
					})
				})

			})
		})
	});
}

if (config.get('jobsPort') === serverPort) {
	//checkPredictionDuplicates();
	//checkSumAdvisorAccount();
	//fixCallPriceForPredictions("2019-03-11");
}










