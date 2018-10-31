/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 17:38:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-31 10:52:55
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');
const schedule = require('node-schedule');
const config = require('config');

const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');
const WSHelper = require('./WSHelper');
const SecurityHelper = require('./Security');

const UserModel = require('../../models/user');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');

function _computePnlStats(portfolio) {
	var totalPnl = 0.0;
	var totalPnlPct = 0.0;
	var totalPnl_long = 0.0;
	var totalPnlPct_long = 0.0;
	var totalPnl_short = 0.0;
	var totalPnlPct_short = 0.0;
	var cost = 0.0;
	var cost_long = 0.0;
	var cost_short = 0.0;
	var netValue = 0.0;
	var netValue_long = 0.0;
	var netValue_short = 0.0;
	var grossValue = 0.0;
	var cash = _.get(portfolio, 'cash', 0.0);
	var pnlPositive = 0;
	var pnlNegative = 0;
	var pnlPositive_long = 0;
	var pnlNegative_long = 0;
	var pnlPositive_short = 0;
	var pnlNegative_short = 0;
	
	var minPnl, maxPnl, minPnl_short, maxPnl_short, minPnl_long, maxPnl_long;

	portfolio.positions.forEach(item => {
		cost += Math.abs(item.investment);
		cost_long += item.investment > 0.0 ? Math.abs(item.investment) : 0.0;
		cost_short += item.investment < 0.0 ? Math.abs(item.investment) : 0.0;

		var _cv = item.avgPrice > 0.0 ? item.investment * (item.lastPrice/item.avgPrice) : item.investment
		var currentValue = _cv + _.get(item, 'dividendCash', 0.0);
		
		var pnl = (currentValue - item.investment)
		totalPnl += pnl;
		totalPnl_long += item.investment > 0 ? pnl : 0.0;
		totalPnl_short += item.investment < 0 ? pnl : 0.0;
		
		pnlPositive += pnl > 0 ? pnl : 0.0;
		pnlPositive_long += item.investment > 0 ? (pnl > 0 ? pnl : 0.0) : 0.0;
		pnlPositive_short += item.investment < 0 ? (pnl > 0 ? pnl : 0.0) : 0.0;
		pnlNegative += pnl < 0 ? Math.abs(pnl) : 0.0;
		pnlNegative_long += item.investment > 0 ? (pnl < 0 ? Math.abs(pnl) : 0.0) : 0.0;
		pnlNegative_short += item.investment < 0 ? (pnl < 0 ? Math.abs(pnl) : 0.0) : 0.0;

		netValue += currentValue;
		grossValue += Math.abs(currentValue);
		netValue_long += item.investment > 0 ? Math.abs(currentValue) : 0.0;
		netValue_short += item.investment < 0 ? Math.abs(currentValue) : 0.0; 

		minPnl = minPnl ? 
					pnl < minPnl.value ? {security: item.security, value: pnl} : minPnl : 
				    {security: item.security, value: pnl};
		maxPnl = maxPnl ? 
					pnl > maxPnl.value ? {security: item.security, value: pnl} : maxPnl : 
					{security: item.security, value: pnl};


		if (item.investment < 0.0) {			
			minPnl_short = minPnl_short ? 
				pnl < minPnl_short.value ? {security: item.security, value: pnl} : minPnl_short : 
			    {security: item.security, value: pnl};
	    	maxPnl_short = maxPnl_short ? 
				pnl > maxPnl_short.value ? {security: item.security, value: pnl} : maxPnl_short : 
				{security: item.security, value: pnl};

	    } else {
			minPnl_long = minPnl_long ? 
				pnl < minPnl_long.value ? {security: item.security, value: pnl} : minPnl_long : 
			    {security: item.security, value: pnl};
	    	maxPnl_long = maxPnl_long ? 
				pnl > maxPnl_long.value ? {security: item.security, value: pnl} : maxPnl_long : 
				{security: item.security, value: pnl};
		}


	});

	netValue += cash;
	grossValue += cash;

	var profitFactor = pnlNegative > 0.0 ? pnlPositive/pnlNegative : NaN;
	var profitFactor_long = pnlNegative_long > 0.0 ? pnlPositive_long/pnlNegative_long : NaN;
	var profitFactor_short = pnlNegative_short > 0.0 ? pnlPositive_short/pnlNegative_short : NaN;

	totalPnlPct = cost > 0.0 ? totalPnl/cost : 0.0;
	totalPnlPct_long = cost_long > 0.0 ? totalPnl_long/cost_long : 0.0;
	totalPnlPct_short = cost_short > 0.0 ? totalPnl_short/cost_short : 0.0;

	return {
		total: {pnl: totalPnl, pnlPct: totalPnlPct, 
			cost: cost, netValue: netValue, grossValue: grossValue,
			cash: cash, minPnl: minPnl, 
			maxPnl: maxPnl, profitFactor: profitFactor, 
			pnlPositive: pnlPositive, pnlNegative: pnlNegative},
		long: {pnl: totalPnl_long, pnlPct: totalPnlPct_long, 
			cost: cost_long, netValue: netValue_long, 
			cash: cash, minPnl: minPnl_long, 
			maxPnl: maxPnl_long, profitFactor: profitFactor_long, 
			pnlPositive: pnlPositive_long, pnlNegative: pnlNegative_long},
		short: {pnl: totalPnl_short, pnlPct: totalPnlPct_short, 
			cost: cost_short, netValue: netValue_short, 
			cash: cash, minPnl: minPnl_short, 
			maxPnl: maxPnl_short, profitFactor: profitFactor_short, 
			pnlPositive: pnlPositive_short, pnlNegative: pnlNegative_short}
		};
}

/*
* Populate pnl stats, netvalue, unrealized Pnl for the portfolio (and individual positions)
*/
function _getPnlStats(portfolio) {

	return new Promise(resolve => {
		var port = Object.assign({}, portfolio);
		
		//Added logic to exclude the cash from advice composition
		var totalVal = _.get(port, 'cash', 0);
		var positions = _.get(port, 'positions', []);

		positions.forEach(item => {
		 	totalVal += Math.abs(item.avgPrice > 0.0 ? (item.investment/item.avgPrice)*item.lastPrice : item.investment);
		});

		positions.map(item => {
			var value = item.avgPrice > 0.0 ? (item.investment/item.avgPrice)*item.lastPrice : item.investment; 
			var weight = totalVal > 0.0 ? value/totalVal : 0.0;
			item.weightInPortfolio = weight;
			//Added unrealized PnL (and %).
			item.unrealizedPnl = value - item.investment;
			item.unrealizedPnlPct = Math.abs(item.investment) > 0 ? (value - item.investment)/Math.abs(item.investment) : 0.0;
			
			return item;
		});

		resolve(_computePnlStats(port));

	});
}

function _updatePortfolioForAveragePrice(portfolioHistory) {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"update_portfolio_average_price", 
    								portfolioHistory: portfolioHistory});
        								
		WSHelper.handleMktRequest(msg, resolve, reject);

	});
}

function _updatePredictionForTrueCallPrice(prediction) {
	var startDate = prediction.startDate;
	var marketOpen = DateHelper.getMarketOpenDateTime();
	var diffMinutes = Math.min(400, marketOpen.diff(marketOpen, 'minutes'));

	return SecurityHelper.getRealTimeStockHistoricalDetail(prediction.position.security, diffMinutes)		
	.then(historicalSecurityDetail => {
		
		var trueLastPrice = _.get(historicalSecurityDetail, 'latestDetail.current', 0);
		prediction.position.avgPrice = trueLastPrice;

		return prediction;
		
	});
}

function _updatePredictionForCallPrice(prediction) {
	var startDate = prediction.startDate;
	var marketOpen = DateHelper.getMarketOpenDateTime();
	var diffMinutes = Math.min(400, marketOpen.diff(marketOpen, 'minutes'));

	return Promise.all([
		SecurityHelper.getRealTimeStockHistoricalDetail(prediction.position.security, diffMinutes),
		SecurityHelper.getStockLatestDetail(prediction.position.security, "RT")
	])
	.then(([historicalSecurityDetail, latestSecurityDetail]) => {
		
		var trueLastPrice = _.get(historicalSecurityDetail, 'latestDetail.current', 0);

		var lastPrice = trueLastPrice ||
			_.get(historicalSecurityDetail, 'latestDetail.close', 0) ||
		    _.get(latestSecurityDetail, 'latestDetail.current', 0) ||
		    _.get(latestSecurityDetail, 'latestDetail.close', 0); 

		prediction.position.avgPrice = lastPrice;

		return prediction;
		
	});
}

function _updatePositionsForPrice(positions, date, type) {
	if (positions) {
		return new Promise((resolve, reject) => {

			var msg = JSON.stringify({action:"update_portfolio_price", 
	            						portfolio: {positions: positions, positionType:'notional'},
	            						date: !date || date == "" ? DateHelper.getCurrentDate() : date,
	            						type: type ? type : "RT"});
         	
         	WSHelper.handleMktRequest(msg, resolve, reject);

	    });
	} else {
		APIError.throwJsonError({message:"Invalid positions: Can't update positions for latest price"});
	}
};

function _computeUpdatedPredictions(predictions, date) {
	
	return predictions.length > 0 ? 	
		Promise.map(predictions, function(prediction) {
			var callPrice = _.get(prediction, 'position.avgPrice', 0.0);
			return callPrice == 0 ? _updatePredictionForCallPrice(prediction) : prediction
			.then(updatedCallPricePrediction => {
				var _partialUpdatedPositions = updatedCallPricePrediction ? [updatedCallPricePrediction.position] : [prediction.position];
				
				//Check whether the predcition needs any price update
				//Based on success status
				return _.get(prediction, 'success.status', false) ? _updatePositionsForPrice(_partialUpdatedPositions, date) : updatedCallPricePrediction;
			})
			.then(updatedPositions => {
				if (updatedPositions) {
					return Object.assign(prediction, {position: updatedPositions[0]});
				} else {
					return prediction;
				}
			});
		})
	: predictions;
};

function _computeTotalPnlStats(entryId, date, category="active") {
	
	return Promise.resolve()
	.then(() => {
		if (category == "all") { //All =  active + ending on date (doesn't include starting)	 

			var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;
			var useEndedPredictions = !isToday || (isToday && moment().isAfter(moment(DateHelper.getMarketCloseDateTime(date))));
			
			return Promise.all([
				useEndedPredictions ? exports.getPredictionsForDate(entryId, date, "ended") : [],
				exports.getPredictionsForDate(entryId, date, "active") //A
			])
			.then(([endedPredictions, activePredictions]) => {
				var allPredictions = endedPredictions.concat(activePredictions);
				return allPredictions;
			})
		} else {
			return exports.getPredictionsForDate(entryId, date, category)
		}
	})
	.then(activePredictions => {

		//Total Pnl
		return _getPnlStats({positions: activePredictions.map(item => {
			if(item.success.status) {
				item.position.lastPrice = item.position.avgPrice*(1+item.target/100);
			}
			return  item.position;
		})}); //map ends
	})
};

function _computeDailyPnlStats(entryId, date, category="all") {
	return exports.getPredictionsForDate(entryId, date, category, false)
	.then(rawPredictions => {
		//First change the startDate of all predictions before today to be yesterday
		var yesterday = moment(date).subtract(1, 'days').toDate();
		rawPredictions = rawPredictions.map(item => {
			if(moment(item.startDate).isBefore(moment(date))) {
				item.startDate = yesterday;
			}

			return item;
		});

		return _computeUpdatedPredictions(rawPredictions, date);
	})
	.then(activePredictionsWithDailyChange => {
		//Total Pnl
		return _getPnlStats({positions: activePredictionsWithDailyChange.map(item => {
			if(item.success.status) {
				item.position.lastPrice = item.position.avgPrice*(1+item.target/100);
			}

			return  item.position;
		})});
	});	
};

module.exports.getTotalPnlStats = function(entryId, date, category="active") {
	return DailyContestEntryPerformanceModel.fetchTotalPnlStatsForDate({contestEntry: entryId}, date)
	.then(contestEntry => {
		if (contestEntry && contestEntry.pnlStats) {
			switch(category) {
				case "active" : return contestEntry.pnlStats[0].cumulative.unrealized; break;
				case "ended" : return contestEntry.pnlStats[0].cumulative.realized; break;
				case "all" : return contestEntry.pnlStats[0].cumulative.all; break;
			}
		} else {
			return _computeTotalPnlStats(entryId, date, category);
		}
	});	
};

module.exports.getDailyPnlStats = function(entryId, date, category) {
	return DailyContestEntryPerformanceModel.fetchDailyPnlStatsForDate({contestEntry: entryId}, date)
	.then(contestEntry => {
		if (contestEntry && contestEntry.pnlStats) {
			return contestEntry.pnlStats[0].daily;
		} else {
			return _computeDailyPnlStats(entryId, date, category);
		}
	});
};

module.exports.getPnlForDate = function(entryId, date, category="total") {
	switch(category) {
		case "daily": return exports.getDailyPnlStats(entryId, date, "all"); break;
		case "total": return exports.getTotalPnlStats(entryId, date, "all"); break;
	}
};

module.exports.getPredictionsForDate = function(entryId, date, category='started', update=true) {
	
	let updatedPredictions;
	return Promise.resolve()
	.then(() => {

		//How to compute all predictions today [All = active (+ ended)]
		//Can there by any duplication in combining the ended and active - YES
		//Because active is a super set of ending that day and ending after the day
		//**** IF used before market close *****
		var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;
		var useEndedPredictions = !isToday || (isToday && moment().isAfter(moment(DateHelper.getMarketCloseDateTime(date))));

		switch(category) {
			case "active": return DailyContestEntryModel.fetchEntryPredictionsActiveOnDate({_id: entryId}, date); break;
			case "started": return DailyContestEntryModel.fetchEntryPredictionsStartedOnDate({_id: entryId}, date); break;
			case "ended": return DailyContestEntryModel.fetchEntryPredictionsEndedOnDate({_id: entryId}, date); break;
			case "all": return Promise.all([
							useEndedPredictions ? DailyContestEntryModel.fetchEntryPredictionsEndedOnDate({_id: entryId}, date) : [],
							DailyContestEntryModel.fetchEntryPredictionsActiveOnDate({_id: entryId}, date) //A
						])
						.then(([endedPredictions, activePredictions]) => {
							return endedPredictions.concat(activePredictions);
						});
		}
	})
	.then(predictions => {
		if (predictions && predictions.length > 0){
			return update ? _computeUpdatedPredictions(predictions, date) : predictions;
		} else {
			return [];
		}
	})
	.then(updatedPredictionsWithLatestPrice => {

		//Update security latest detail
		if (update) {
			return Promise.map(updatedPredictionsWithLatestPrice, function(prediction) {
				return SecurityHelper.getStockLatestDetail(prediction.position.security)
				.then(securityDetail => {
					var updatedPosition = Object.assign(prediction.position, {security: securityDetail});
					return Object.assign({position: updatedPosition}, prediction);
				})
			});
		} else {
			return updatedPredictionsWithLatestPrice;
		}
	});
};

module.exports.updateAllEntriesPnlStats = function(date){
	return DailyContestEntryModel.fetchEntries({}, {fields: '_id'})
	.then(dailyContestEntries => {
		return Promise.mapSeries(dailyContestEntries, function(contestEntry) {
			let contestEntryId = contestEntry._id;
			date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

			return Promise.all([
				_computeTotalPnlStats(contestEntryId, date, "active"),
				_computeTotalPnlStats(contestEntryId, date, "ended"),
				_computeTotalPnlStats(contestEntryId, date, "all"),
				_computeDailyPnlStats(contestEntryId, date, "all")
			])
			.then(([activePredictionsPnl, endedPredictionsPnl, allPredictionsPnl, allPredictionsDailyPnl]) => {
				const updates = {
					cumulative: {
						unrealized: activePredictionsPnl,
						realized: endedPredictionsPnl,
						all: allPredictionsPnl
					},
					daily: allPredictionsDailyPnl
				}
				
				return DailyContestEntryPerformanceModel.updateEntryPnlStats({contestEntry: contestEntryId}, updates, date);
			})

		});
	});
};

module.exports.checkForPredictionTarget = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	return DailyContestEntryModel.fetchEntries({}, {fields: '_id'})
	.then(dailyContestEntries => {
		return Promise.mapSeries(dailyContestEntries, function(contestEntry) {
			let contestEntryId = contestEntry._id;
			return exports.getPredictionsForDate(contestEntryId, date, "active")
			.then(updatedPredictions => {
				return Promise.map(updatedPredictions, function(prediction) {
					if (!prediction.success.status) {
						return SecurityHelper.getStockLatestDetail(prediction.position.security, "RT")
						.then(securityDetail => {
							var investment = prediction.position.investment;
							var target = prediction.target;
							var lowPrice = securityDetail.latestDetail.low;
							var highPrice = securityDetail.latestDetail.high;
							var avgPrice = prediction.position.avgPrice;
							var change = investment < 0 ? 
								(lowPrice - avgPrice)*100/avgPrice : 
								(highPrice - avgPrice)*100/avgPrice;

							var endDate = prediction.endDate;
							var ticker = prediction.position.security.ticker;

							let success = false;

							if (investment < 0 && change < target) {
								success = true
							} else if (investment > 0 && change > target) {
								success = true; 
							}

							if (success) {
								return DailyContestEntryModel.updatePredictionStatus({_id: contestEntryId}, prediction);
							}
						});
					}
				})
				
			})
		})
	})
};

function _updateCallPriceJob() {
	return DailyContestEntryModel.fetchEntries({}, {fields: '_id'})
	.then(contestEntries => {
		return Promise.mapSeries(contestEntries, function(contestEntry) {
			let contestEntryId = contestEntry._id;

			const date = DateHelper.getMarketCloseDateTime();
			return DailyContestEntryModel.fetchEntryPredictionsStartedOnDate({_id: contestEntryId}, date)
			.then(predictions => {
				if (predictions && predictions.length > 0) {
					return Promise.mapSeries(predictions, function(prediction) {
						var callPrice = _.get(prediction, 'position.avgPrice', 0.0);
						if (callPrice == 0) {
							return _updatePredictionForTrueCallPrice(prediction)
							.then(updatedPrediction => {
								var updatedCallPrice = _.get(updatedPrediction, 'position.avgPrice', 0.0);
								if (updatedCallPrice != 0) {
									return DailyContestEntryModel.updatePredictionCallPrice({_id: contestEntryId}, prediction, updatedCallPrice);
								}
							});
						}
					});	
				}
			});

		});
	})
}


const scheduleString = `*/5 * ${DateHelper.getMarketOpenHour() - 1}-${DateHelper.getMarketCloseHour() + 1} * 1-5`;

//Run every 5th minute
schedule.scheduleJob(scheduleString, function() { 
    _updateCallPriceJob();
});
