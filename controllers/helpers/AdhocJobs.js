/*
* @Author: Shiv Chawla
* @Date:   2019-01-04 09:50:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-01-05 23:39:19
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

/*********TEMPORARY BACKFILL CODE***************/
module.exports.updatePerformanceHistoricalAdhoc = function() {
	const dates = ["2018-11-12","2018-11-13","2018-11-14","2018-11-15", "2018-11-16", 
	"2018-11-19","2018-11-20","2018-11-21", "2018-11-22", 
	"2018-11-26","2018-11-27","2018-11-28", "2018-11-29", "2018-11-30",
	"2018-12-03","2018-12-04","2018-12-05", "2018-12-06"];

    return Promise.mapSeries(dates, function(date) {
        return resetIntervalPrices(date)
    }) 
    .then(() => {
         return Promise.mapSeries(dates, function(date) {
         	console.log(date);
            return DailyContestEntryHelper.updatePredictionsForIntervalPrice(date) 
            .then(() => {
                return DailyContestEntryHelper.updateAllEntriesLatestPnlStats(date);
            })
            .then(() => {
                return DailyContestEntryHelper.updateAllEntriesNetPnlStats(date);                       
            })
        })
    });
}

module.exports.updatePredictionStatusFormat = function() {
	const dates = ["2018-11-12","2018-11-13","2018-11-14","2018-11-15", "2018-11-16", 
	"2018-11-19","2018-11-20","2018-11-21", "2018-11-22", 
	"2018-11-26","2018-11-27","2018-11-28", "2018-11-29", "2018-11-30",
	"2018-12-03","2018-12-04","2018-12-05", "2018-12-06", "2018-12-07", 
	"2018-12-10","2018-12-11", "2018-12-12", "2018-12-13", "2018-12-14", 
    "2018-12-17", "2018-12-18", "2018-12-19", "2018-12-20", "2018-12-21"];

 	return Promise.mapSeries(dates, function(date) {
		return DailyContestEntryModel.fetchDistinctAdvisors({date: DateHelper.getMarketCloseDateTime(date)})
		.then(distinctAdvisors => {
			return Promise.mapSeries(distinctAdvisors, function(advisorId) {
				return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {priceUpdate: false})
				.then(predictions => {
					return Promise.mapSeries(predictions, function(prediction) {
						var success = _.get(prediction, 'success', {});

						var newStatus = {profitTarget: false};

						var date = _.get(success, 'date', null);
						if (date) {
							newStatus = {...newStatus, date};
						}

						var trueDate = _.get(success, 'trueDate', null);
						if (trueDate) {
							newStatus = {...newStatus, trueDate};	
						}

						var profitTarget = _.get(success, 'status', false);
						if (profitTarget) {
							newStatus = {...newStatus, profitTarget};		
						}

						var price = _.get(success, 'price', 0);
						if (price) {
							newStatus = {...newStatus, price};		
						}

						newStatus = {...newStatus, stopLoss: false, manualExit: false};		
					
						const updatedPrediction = {...prediction, status: newStatus};

						return DailyContestEntryModel.updatePrediction({advisor: advisorId}, updatedPrediction);

					})
				})
			})
		})
	})
};

//For new incentive structure
module.exports.updateAdvisorFormatForAdvisorId = function(advisorId) {
	return DailyContestEntryHelper.getPredictionsForDate(advisorId, DateHelper.getCurrentDate(), {category:'all', priceUpdate: false})
	.then(activePredictions => {
		
		let totalInvestment = 0;
		let cashUsed = 0;
		activePredictions.forEach(item => {
			var investment = item.position.investment;
			totalInvestment += Math.abs(investment);
			cashUsed += investment;
		});
		
		if (totalInvestment <= 1000) {
			const newAccount = {
				investment: totalInvestment,
				liquidCash: Math.max(1000 - totalInvestment, 0),
				cash: Math.max(1000 - cashUsed, 0),
			};	

			return AdvisorModel.updateAdvisor({_id: advisorId}, {account: newAccount})
			.then(() => {return true;})
		} else {
			return false;
		}
	});
};

module.exports.updateAdvisorFormat = function() {
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisor) {
			let advisorId = advisor._id
			
			return exports.updateAdvisorFormatForAdvisorId(advisorId)
			.then(updated => {
				if (!updated) {
					console.log(advisor);
					console.log("Existing Investment greater than 10 Lacs");
					console.log("Normalizing the investment to 7L")

					return DailyContestEntryHelper.getPredictionsForDate(advisorId, DateHelper.getCurrentDate(), {category:'all', priceUpdate: false})
					.then(activePredictions => {
						let totalInvestment = 0;
						let cashUsed = 0;
						activePredictions.forEach(item => {
							var investment = item.position.investment;
							totalInvestment += Math.abs(investment);
							cashUsed -= investment;
						});
						
						if (totalInvestment > 1000) {
							return Promise.map(activePredictions, function(prediction) {
								prediction.position.investment = (prediction.position.investment/totalInvestment)*700;
								return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction); 
							})
						}
					})
					.then(() => {
						return exports.updateAdvisorFormatForAdvisorId(advisorId);
					})	
				}
			})
		})
    })
}; 

/*
exports.updateAdvisorFormat()
.then(() => {
	exports.updateAllEntriesLatestPortfolioStats();
})
.then(() => {
	exports.updateAllEntriesLatestPnlStats();
})
.then(() => {
	exports.updatePerformanceFormat();
})
*/

module.exports.updatePerformanceFormat = function() {
	const dates = ["2018-11-12","2018-11-13","2018-11-14","2018-11-15", "2018-11-16", 
	"2018-11-19","2018-11-20","2018-11-21", "2018-11-22", 
	"2018-11-26","2018-11-27","2018-11-28", "2018-11-29", "2018-11-30",
	"2018-12-03","2018-12-04","2018-12-05", "2018-12-06", "2018-12-07", 
	"2018-12-10","2018-12-11", "2018-12-12", "2018-12-13", "2018-12-14", 
    "2018-12-17", "2018-12-18", "2018-12-19", "2018-12-20", "2018-12-21", 
    "2018-12-24", "2018-12-26", "2018-12-27", "2018-12-28"];

    return Promise.mapSeries(dates, function(date) {
    	date = DateHelper.getMarketCloseDateTime(date);
    	
    	console.log(date);
    	
    	return DailyContestEntryModel.fetchDistinctAdvisors()
    	.then(distinctAdvisors => {
    		return Promise.mapSeries(distinctAdvisors, function(advisorId) {
    			return DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date)
    			.then(pnlStatsForAdvisor => {
    				if (pnlStatsForAdvisor) {
    					const pnlStats = pnlStatsForAdvisor.toObject();
    					try {

    						const detailTypes = ["daily", "cumulative"];

    						detailTypes.forEach(detailType => {
    							const val = _.get(pnlStats, `detail.${detailType}.active`, null);
								if (val) {
	    							_.set(pnlStats, `detail.${detailType}.all`, val);
	    							delete pnlStats.detail[`${detailType}`].active;
    							}
							});

							const horizonTypes = ["all", "ended", "started"];

							horizonTypes.forEach(horizonType => {
								const val = _.get(pnlStats, `detail.cumulative.${horizonType}.all`, null);
								if (val) {
    								_.set(pnlStats, `detail.cumulative.${horizonType}.portfolio`, val);
    								delete pnlStats.detail.cumulative[`${horizonType}`].all;
    							}	
							});

							var netPnlTypes = ["realized", "total"];

							netPnlTypes.forEach(netPnlType => {
								const val = _.get(pnlStats, `net.${netPnlType}.all`, null);
								if (val) {
    								_.set(pnlStats, `net.${netPnlType}.portfolio`, val);
    								delete pnlStats.net[`${netPnlType}`].all;
    							}
							});
    							
							return Promise.all([
								DailyContestEntryPerformanceModel.updatePnlStatsForDate({advisor: advisorId}, pnlStats.detail, date, "detail"),
								DailyContestEntryPerformanceModel.updatePnlStatsForDate({advisor: advisorId}, pnlStats.net, date, "net")
							]);

						}catch (err) {
							console.log(err.message);
						}

					}
    			});		
    		});
    	});
    });
};

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
	
	var dates = ["2019-01-01", "2019-01-02", "2019-01-03", "2019-01-04"];
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
					
					allPredictions.forEach(prediction => {
						var stopLoss = _.get(prediction, 'status.stopLoss', false);
						var profitTarget = _.get(prediction, 'status.profitTarget', false);
						var expired = _.get(prediction, 'status.expired', false) || !moment(DateHelper.getMarketCloseDateTime(prediction.endDate)).isAfter(date);
						var manualExit = _.get(prediction, 'status.manualExit', false);

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
							return DailyContestEntryPerformanceModel.updatePortfolioStatsForDate({advisor: advisorId}, updates, date);
						}
					} else {
						console.log(`Checksum VALID for Advisor: ${advisorId} on Date: ${date.toDate()}`);
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

if (config.get('jobsPort') === serverPort) {
	//checkSumAdvisorAccount()
}


