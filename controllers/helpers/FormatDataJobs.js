/*
* @Author: Shiv Chawla
* @Date:   2019-01-11 19:42:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-01-11 20:39:02
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const config = require('config');

const DateHelper = require('../../utils/Date');
const DailyContestEntryHelper = require('./DailyContestEntry');
const DailyContestStatsHelper = require('./DailyContestStats');

const UserModel = require('../../models/user');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');


const serverPort = require('../../index').serverPort;


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

module.exports.populateEarningStats = function() {

	var seedDate = DateHelper.getMarketCloseDateTime("2018-11-12");
	var lastDate = DateHelper.getMarketCloseDateTime();

	var nDays = lastDate.diff(seedDate, 'days');

	var date = seedDate;

	return new Promise(Array.from(Array(nDays).keys()), function(days) {
		
		if (!moment(date).isAfter(moment(lastDate))) {

			return DailyContestStatsModel.fetchContestStats(date, {fields: 'dailyWinners weeklyWinners'})
			.then(contestStats => {

				return Promise.all([
					DailyContestStatsHelper.updateEarningStats(contestStats.dailyWinners || [], date, "daily"),
					DailyContestStatsHelper.updateEarningStats(contestStats.weeklyWinners || [], date, "weekly")
				]);
			})
			.then(() => {
				date = DateHelper.getNextNonHolidayWeekday(date, 1);
			})

		}	

	});

};

if (config.get('jobsPort') === serverPort) {
	

	//OLD JOB TO UPDATE ADVISOR FORMAT (NOT REQUIRED)
	// exports.updateAdvisorFormat()
	// .then(() => {
	// 	exports.updateAllEntriesLatestPortfolioStats();
	// })
	// .then(() => {
	// 	exports.updateAllEntriesLatestPnlStats();
	// })
	// .then(() => {
	// 	exports.updatePerformanceFormat();
	// })

}
