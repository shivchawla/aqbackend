/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 17:38:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-27 17:05:47
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');

const config = require('config');
const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');
const WSHelper = require('./WSHelper');

const UserModel = require('../../models/user');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');

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

		var pnlStats = _computePnlStats(port);
		resolve(_computePnlStats(port));

		//resolve(Object.assign(port, {pnlStats: pnlStats}));
	});
}

function _getPnlStatsForWeek(entryId, date) {
	//Get week of date
	var datesInWeek = DateHelper.getDatesInWeek(date);

	return Promise.map(datesInWeek, function(d) {
		//convert date to match the result time
		var _d = DateHelper.getMarketClose(d);

		return DailyContestEntryModel.fetchEntryPnlStatsForDate({_id: entryId}, _d)
		.then(contestEntry => {
			if (_.get(contestEntry, 'performance.daily', null) && contestEntry.performance.daily.length > 0) {
				return contestEntry.performance.daily[0].pnlStats;
			} else {
				return null;
			}
		});
	})
	.then(pnlStatsAllDatesInWeek => {

		let pnlStatsForWeek = {
			total: {
				pnl: 0.0, pnlPct: 0.0, 
				cost: 0.0, netValue: 0.0, 
				minPnl: null, maxPnl: null, 
				profitFactor: 0.0, 
				pnlPositive: 0.0, pnlNegative: 0.0,
				days: 0
			},

			long: {
				pnl: 0.0, pnlPct: 0.0, 
				cost: 0.0, netValue: 0.0, 
				minPnl: null, maxPnl: null, 
				profitFactor: 0.0, 
				pnlPositive: 0.0, pnlNegative: 0.0,
				days: 0
			},

			short: {
				pnl: 0.0, pnlPct: 0.0, 
				cost: 0.0, netValue: 0.0, 
				minPnl: null, maxPnl: null, 
				profitFactor: 0.0, 
				pnlPositive: 0.0, pnlNegative: 0.0,
				days: 0
			},
		};
		
		pnlStatsAllDatesInWeek.forEach(pnlStatsForDay => {
			if (pnlStatsForDay) {

				['total', 'long', 'short'].forEach(type => {
					const {pnl = 0.0, pnlPct = 0.0, 
					cost = 0.0, netValue = 0.0, 
					cash = 0.0, minPnl = null, 
					maxPnl = null, profitFactor = 0.0, 
					pnlPositive = 0.0, pnlNegative = 0.0} = _.get(pnlStatsForDay, type, {});
	
					pnlStatsForWeek[type].pnl += pnl;
					pnlStatsForWeek[type].cost += cost;
					pnlStatsForWeek[type].netValue += netValue;
					pnlStatsForWeek[type].minPnl = minPnl ? (pnlStatsForWeek[type].minPnl &&   
							pnlStatsForWeek[type].minPnl > minPnl.value) ? minPnl : pnlStatsForWeek[type].minPnl : pnlStatsForWeek[type].minPnl;

					pnlStatsForWeek[type].maxPnl = maxPnl ? (pnlStatsForWeek[type].maxPnl &&   
							pnlStatsForWeek[type].maxPnl > maxPnl.value) ? maxPnl : pnlStatsForWeek[type].maxPnl : pnlStatsForWeek[type].maxPnl;

					pnlStatsForWeek[type].pnlPositive += pnlPositive;
					pnlStatsForWeek[type].pnlNegative += pnlNegative;

					pnlStatsForWeek[type].pnlNegative += pnlNegative;

					pnlStatsForWeek[type].days += 1; 
				}) 
			}	    
		});


		['total', 'long', 'short'].forEach(type => {
			if (pnlStatsForWeek[type].days > 0) {
				pnlStatsForWeek[type].pnlPct = pnlStatsForWeek[type].cost > 0.0 ? pnlStatsForWeek[type].pnl/pnlStatsForWeek[type].cost : 0.0;
				pnlStatsForWeek[type].profitFactor = pnlStatsForWeek[type].pnlNegative > 0.0 ? pnlStatsForWeek[type].pnlPositive/pnlStatsForWeek[type].pnlNegative : NaN;
			}
		});	

		return pnlStatsForWeek;	

	});
}

function _updatePortfolioForAveragePrice(portfolioHistory) {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"update_portfolio_average_price", 
    								portfolioHistory: portfolioHistory});
        								
		WSHelper.handleMktRequest(msg, resolve, reject);

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
		return _updatePortfolioForAveragePrice([{positions: [prediction.position], positionType:'notional', startDate: prediction.startDate}])
		.then(updatedAvgPricePredictionPortfolio => {
			var _partialUpdatedPositions = updatedAvgPricePredictionPortfolio ? updatedAvgPricePredictionPortfolio.positions : [prediction.position];
			return _updatePositionsForPrice(_partialUpdatedPositions, date);
		})
		.then(updatedPositions => {
			if (updatedPositions) {
				return Object.assign(prediction, {position: updatedPositions[0]});
			} else {
				return prediction;
			}
		});
	})
	// .then(updatedActivePredictions => {
	// 	return inActivePredictions.concat(activePredictions);
	// }) 
	: predictions;
};

//portfolio.date is the start date of the portfolio
//computing portfolio pricing based on this date will be WRONG
//MUST ADD one trading day to if
module.exports.getUpdatedPortfolioForPrice = function(portfolio, typ) {	
	return _updatePositionsForPrice(portfolio.positions, DateHelper.getNextNonHolidayWeekday(portfolio.date), typ)
	.then(portfolio => {
		if (portfolio) {
			return _populateStats(portfolio);
		} else {
			return positions;
		}
	})
	.then(updatedPortfolio => {
		return updatedPortfolio.positions;
	});
};

module.exports.getUpdatedPortfolioForAveragePrice = function(portfolio) {
	return _updatePortfolioForAveragePrice([{...portfolio, positionType:'notional', startDate: portfolio.date}])
	.then(updatedAvgPricePortfolio => {
		var _partialUpdatedPositions = updatedAvgPricePortfolio ? updatedAvgPricePortfolio.positions : portfolio.positions;
		return _updatePositionsForPrice(_partialUpdatedPositions, DateHelper.getNextNonHolidayWeekday(portfolio.date));
	})
	.then(updatedPositions => {
		if (updatedPositions) {
			return Object.assign(portfolio, {positions: updatedPositions, cash: _.get(portfolio, 'cash', 0.0)});
		} else {
			return portfolio;
		}
	});
};

module.exports.updateContestEntryPnlStats = function(entryId, date, updatedPredictions = null) {
	
	let entryActive;
	return Promise.resolve()
	.then(() => {
		if (updatedPredictions) {
			return updatedPredictions;
		} else {
			//This gives predictions today
			//And not predictions ending today
			return getPredictionsForDate(entryId, date);
		}
	})
	.then(contestEntryPredictions => {
		
		var predictionPositions = contestEntryPredictions ? contestEntryPredictions.map(item => item.position) : [];
		return Promise.all ([
			predictionPositions.length > 0 ? _getPnlStats({positions: predictionPositions}) : null,
			DailyContestEntryPerformanceModel.getTotalPnlStatsForLastDate({contestEntry: entryId}, date)
		])
	})
	.then(([pnlStatsForPredictions, pnlStatsTotalBefore]) => {
		if (pnlStatsForPredictions) {
			let pnlStats = {cumulative: {active: pnlStatsForPredictions}};
			return DailyContestEntryPerformanceModel.updateEntryPnlStats({contestEntry: entryId}, pnlStats, date);
		}
	})
	.then(() => {
		return Promise.all([
			_getCumulativePnlStats(entryId, date),
			_getCumulativePnlStats(entryId, date, true)
		])
	})
	.then(pnlStatsForWeek => {
		if (pnlStatsForWeek) {
			let pnlStats = {cumulative: pnlStatsForWeek};
			return DailyContestEntryModel.updateEntryPnlStats({_id: entryId}, pnlStats, date);
		}
	})
};

module.exports.computeTotalPnlStatsForActivePredictions = function(entryId, date) {
	return exports.getPredictionsForDate(entryId, date, "active")
	.then(activePredictions => {
		//Total Pnl
		return _getPnlStats({positions: activePredictions.map(item => item.position)});
	})
};

module.exports.getTotalPnlStatsForActivePredictions = function(entryId, date) {
	return DailyContestEntryPerformanceModel.fetchTotalPnlStatsForDate({_id: entryId}, date)
	.then(contestEntry => {
		if (contestEntry && contestEntry.pnlStats) {
			return contestEntry.pnlStats[0].total;
		} else {
			return exports.computeTotalPnlStatsForActivePredictions(entryId, date);
		}
	});	
};

module.exports.computeDailyPnlStatsForActivePredictions = function(entryId, date) {
	return exports.getPredictionsForDate(entryId, date, "active", false)
	.then(rawPredictions => {
		//First change the startDate of all predictions before today to be yesterday
		var yesterday = moment(date).subtract(1, 'days').toDate();
		rawPredictions.map(item => {
			if(moment(item.startDate).isBefore(moment(date))) {
				item.startDate = yesterday;
			}

			return item;
		});

		return _computeUpdatedPredictions(rawPredictions, date);
	})
	.then(activePredictionsWithDailyChange => {
		//Total Pnl
		return _getPnlStats({positions: activePredictionsWithDailyChange.map(item => item.position)});
	})	
};

module.exports.getDailyPnlStatsForActivePredictions = function(entryId, date) {
	return DailyContestEntryPerformanceModel.fetchDailyPnlStatsForDate({_id: entryId}, date)
	.then(contestEntry => {
		if (contestEntry && contestEntry.pnlStats) {
			return contestEntry.pnlStats[0].daily;
		} else {
			return exports.computeDailyPnlStatsForActivePredictions(entryId, date);
		}
	});
};

module.exports.getPnlStatsForAllPredictions = function(entryId, date) {
	return DailyContestEntryPerformanceModel.fetchLatestPnlStats({_id: entryId})
	.then(contestEntryDoc => {
		let contestEntry = contestEntryDoc ? contestEntryDoc.toObject() : {};
		if (_.get(contestEntry, 'pnlStats', null) && contestEntry.pnlStats.length > 0) {
			return contestEntry.pnlStats[0];
		} else {
			return null;
		}
	})
	.then(latestPnlStats=> {
		if (moment(latestPnlStats.date).isSame(moment(date))) {
			return latestPnlStats.all;
		} else {
			return Promise.all([
				latestPnlStats,
				exports.getDailyPnlStatsForActivePredictions(entryId, date),
				exports.getTotalPnlStatsForActivePredictions(entryId, date)
			]);
		}
	})
	.then(([latestPnlStats, dailyPnlStatsOfActivePredictions, totalPnlStatsOfActivePredictions]) => {
		['total', 'long', 'short'].forEach(type => {
			const {pnl = 0.0, pnlPct = 0.0, 
			cost = 0.0, netValue = 0.0, profitFactor = 0.0, 
			pnlPositive = 0.0, pnlNegative = 0.0} = _.get(dailyPnlStatsOfActivePredictions, type, {});

			const {cash = 0.0, minPnl = null, 
				maxPnl = null, pnlPositive = 0.0, pnlNegative = 0.0} = 
					_.get(totalPnlStatsOfActivePredictions, type, {});

			latestPnlStats[type].pnl += pnl;
			latestPnlStats[type].cost += cost;
			latestPnlStats[type].netValue += netValue;
			latestPnlStats[type].minPnl = minPnl ? (latestPnlStats[type].minPnl &&   
					latestPnlStats[type].minPnl > minPnl.value) ? minPnl : latestPnlStats[type].minPnl : pnlStatsForWeek[type].minPnl;

			latestPnlStats[type].maxPnl = maxPnl ? (latestPnlStats[type].maxPnl &&   
					latestPnlStats[type].maxPnl > maxPnl.value) ? maxPnl : latestPnlStats[type].maxPnl : pnlStatsForWeek[type].maxPnl;

			latestPnlStats[type].pnlPositive += pnlPositive;
			latestPnlStats[type].pnlNegative += pnlNegative;

			latestPnlStats[type].pnlNegative += pnlNegative;

			latestPnlStats[type].days += 1; 
		})
	});
};

module.exports.getPnlForDate = function(entryId, date, category="total") {
	switch(category) {
		case "daily": return exports.getDailyPnlStatsForActivePredictions(entryId, date); break;
		case "total": return exports.getTotalPnlStatsForActivePredictions(entryId, date); break;
	}
};

module.exports.getPredictionsForDate = function(entryId, date, category='started', update=true) {
	let updatedPredictions;
	return Promise.resolve()
	.then(() => {
		switch(category) {
			case "active": return DailyContestEntryModel.fetchEntryPredictionsActiveOnDate({_id: entryId}, date); break;
			case "started": return DailyContestEntryModel.fetchEntryPredictionsStartingOnDate({_id: entryId}, date); break;
			case "ended": return DailyContestEntryModel.fetchEntryPredictionsEndingOnDate({_id: entryId}, date); break;
		}
	})
	.then(predictions => {
		if (predictions && predictions.length > 0){
			return update ? _computeUpdatedPredictions(predictions, date) : predictions;
		} else {
			return [];
		}
	})
};
