/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 17:38:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-25 19:22:27
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

function _computePnlStats(portfolio) {
	var totalPnl = 0.0;
	var totalPnlPct = 0.0;
	var cost = 0.0;
	var netValue = 0.0;
	var cash = portfolio.cash;
	var pnlPositive = 0;
	var pnlNegative = 0;
	
	var minPnl;
	var maxPnl;

	portfolio.positions.forEach(item => {
		cost += Math.abs(item.investment)
		var _cv = item.avgPrice > 0.0 ? item.investment * (item.lastPrice/item.avgPrice) : item.investment
		var currentValue = _cv + (item.dividendCash ? item.dividendCash : 0.0);
		
		var pnl = (currentValue - item.investment)
		totalPnl += pnl;
		
		pnlPositive += pnl > 0 ? pnl : 0.0;
		pnlNegative += pnl < 0 ? Math.abs(pnl) : 0.0;

		netValue += currentValue + portfolio.cash;

		minPnl = minPnl ? 
					pnl < minPnl.value ? {security: item.security, value: pnl} : minPnl : 
				    {security: item.security, value: pnl};
		maxPnl = maxPnl ? 
					pnl > maxPnl.value ? {security: item.security, value: pnl} : maxPnl : 
					{security: item.security, value: pnl};
	});

	var profitFactor = pnlNegative > 0.0 ? pnlPositive/pnlNegative : NaN;

	totalPnlPct = cost > 0.0 ? totalPnl/cost : 0.0;

	return {totalPnl: totalPnl, totalPnlPct: totalPnlPct, 
		cost: cost, netValue: netValue, 
		cash: cash, minPnl: minPnl, 
		maxPnl: maxPnl, profitFactor: profitFactor, 
		pnlPositive: pnlPositive, pnlNegative: pnlNegative};
}

/*
* Populate pnl stats, netvalue, unrealized Pnl for the portfolio (and individual positions)
*/
function _populateStats(portfolio) {

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

		resolve(Object.assign(port, {pnlStats: pnlStats}));
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
			totalPnl: 0.0, totalPnlPct: 0.0, 
			cost: 0.0, netValue: 0.0, 
			minPnl: null, maxPnl: null, 
			profitFactor: 0.0, 
			pnlPositive: 0.0, pnlNegative: 0.0,
			days: 0
		};
		
		pnlStatsAllDatesInWeek.forEach(pnlStatsForDay => {
			if (pnlStatsForDay) {
				const {totalPnl = 0.0, totalPnlPct = 0.0, 
					cost = 0.0, netValue = 0.0, 
					cash = 0.0, minPnl = null, 
					maxPnl = null, profitFactor = 0.0, 
					pnlPositive = 0.0, pnlNegative = 0.0} = pnlStatsForDay;


				pnlStatsForWeek.totalPnl += totalPnl;
				pnlStatsForWeek.cost += cost;
				pnlStatsForWeek.netValue += netValue;
				pnlStatsForWeek.minPnl = minPnl ? (pnlStatsForWeek.minPnl &&   
						pnlStatsForWeek.minPnl > minPnl.value) ? minPnl : pnlStatsForWeek.minPnl : pnlStatsForWeek.minPnl;

				pnlStatsForWeek.maxPnl = maxPnl ? (pnlStatsForWeek.maxPnl &&   
						pnlStatsForWeek.maxPnl > maxPnl.value) ? maxPnl : pnlStatsForWeek.maxPnl : pnlStatsForWeek.maxPnl;

				pnlStatsForWeek.pnlPositive += pnlPositive;
				pnlStatsForWeek.pnlNegative += pnlNegative;

				pnlStatsForWeek.pnlNegative += pnlNegative;

				pnlStatsForWeek.days += 1;  
			}	    
		});

		if (pnlStatsForWeek.days > 0) {
			pnlStatsForWeek.totalPnlPct = pnlStatsForWeek.cost > 0.0 ? pnlStatsForWeek.totalPnl/pnlStatsForWeek.cost : 0.0;
			pnlStatsForWeek.profitFactor = pnlStatsForWeek.pnlNegative > 0.0 ? pnlStatsForWeek.pnlPositive/pnlStatsForWeek.pnlNegative : NaN;
		}	

		return pnlStatsForWeek;	

	});
}

function _updatePortfolioForAveragePrice(portfolioHistory) {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"update_dollar_portfolio_average_price", 
    								portfolioHistory: portfolioHistory});
        								
		WSHelper.handleMktRequest(msg, resolve, reject);

	});
}

function _updatePositionsForPrice(positions, date, type) {
	if (positions) {
		return new Promise((resolve, reject) => {

			var msg = JSON.stringify({action:"update_dollar_portfolio_price", 
	            						portfolio: {positions: positions},
	            						date: !date || date == "" ? DateHelper.getCurrentDate() : date,
	            						type: type ? type : "RT"});
         	
         	WSHelper.handleMktRequest(msg, resolve, reject);

	    });
	} else {
		APIError.throwJsonError({message:"Invalid positions: Can't update positions for latest price"});
	}
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
	return _updatePortfolioForAveragePrice([{positions: portfolio.positions, startDate: portfolio.date}])
	.then(updatedAvgPricePortfolio => {
		var _partialUpdatedPositions = updatedAvgPricePortfolio ? updatedAvgPricePortfolio.positions : portfolio.positions;
		return _updatePositionsForPrice(_partialUpdatedPositions, DateHelper.getNextNonHolidayWeekday(portfolio.date));
	})
	.then(updatedPositions => {
		if (updatedPositions) {
			return Object.assign({positions: updatedPositions, cash: _.get(portfolio, 'cash', 0.0)}, portfolio);
			//return populatePnl ? _populateStats({positions: updatedPositions, cash: _.get(portfolio, 'cash', 0.0)}) : {positions: updatedPositions};
		} else {
			return portfolio;
		}
	});
};

module.exports.getUpdatedPortfolio = function(portfolio) {
	return exports.getUpdatedPortfolioForAveragePrice(portfolio);
};

module.exports.getUpdatedContestPortfolioDetail = function(entryId, date) {
	return DailyContestEntryModel.fetchEntryPortfolioForDate({_id: entryId}, date)
	.then(contestEntry => {
		let _storedPortfolioDetail = null;
		
		if (_.get(contestEntry, 'portfolioDetail', null) && contestEntry.portfolioDetail.length > 0) {
			_storedPortfolioDetail = contestEntry.portfolioDetail[0];
		}

		return _.get(_storedPortfolioDetail, 'active', true)  && _storedPortfolioDetail ? 	
			exports.getUpdatedPortfolio(_storedPortfolioDetail)
			.then(updatedPortfolioDetail => {
				return Object.assign(_storedPortfolioDetail, updatedPortfolioDetail);
			}) :
			_storedPortfolioDetail;
	})
}
	
module.exports.getUpdatedContestEntry = function(entryId, date, populatePnl=false) {
	return Promise.resolve()
	.then(() => {
		return populatePnl ? exports.updateContestEntryPnlStats(entryId, date) : null		
	})
	.then(() => {
		return Promise.all([
			exports.getUpdatedContestPortfolioDetail(entryId, date),
			populatePnl ? exports.getContestEntryPnlStats(entryId, date) : null
		]);	
	})
	.then(([contestEntryPortfolioDetail, pnlStats]) => {
		return populatePnl && pnlStats ? 
			Object.assign({pnlStats: pnlStats}, contestEntryPortfolioDetail) :
			contestEntryPortfolioDetail;
	});
};

module.exports.updateContestEntryPnlStats = function(entryId, date) {
	
	return exports.getUpdatedContestPortfolioDetail(entryId, date)
	.then(contestEntryPortfolioDetail => {
		let entryActive;

		if (contestEntryPortfolioDetail){		
			entryActive = _.get(contestEntryPortfolioDetail, 'active', true); 			
		} 

		var updatedPositions = _.get(contestEntryPortfolioDetail, 'positions', []);
		return entryActive ? Promise.all([
			_populateStats({positions: updatedPositions}),
			_getPnlStatsForWeek(entryId, date)
		]) : [null, null];	
			
	})
	.then(([updatedContestEntryForDate, pnlStatsForWeek]) => {
		if (pnlStatsForWeek && updatedContestEntryForDate) {
			var pnlStatsForDay = _.get(updatedContestEntryForDate, 'pnlStats', {});
			let pnlStats = {daily: pnlStatsForDay, weekly: pnlStatsForWeek};

			return DailyContestEntryModel.updateEntryPnlStats({_id: entryId}, pnlStats, date);
		}
	});
};

module.exports.getContestEntryPnlStats = function(entryId, date) {
	return Promise.all([
		exports.getContestEntryDailyPnlStats(entryId, date),
		exports.getContestEntryWeeklyPnlStats(entryId, date)
	])
	.then(([pnlStatsForDay, pnlStatsForWeek]) => {
		return {weekly: pnlStatsForWeek.pnlStats, daily: pnlStatsForDay.pnlStats};
	});
};

module.exports.getContestEntryDailyPnlStats = function(entryId, date) {
	return DailyContestEntryModel.fetchEntryPnlStatsForDate({_id: entryId}, date)
	.then(contestEntryDoc => {
		let contestEntry = contestEntryDoc.toObject();
		if (_.get(contestEntry, 'performance.daily', null) && contestEntry.performance.daily.length > 0) {
			return {advisor: contestEntry.advisor, pnlStats: contestEntry.performance.daily[0].pnlStats};
		} else {
			return null;
		}
	})
};


module.exports.getContestEntryWeeklyPnlStats = function(entryId, date) {
	return DailyContestEntryModel.fetchEntryPnlStatsForDate({_id: entryId}, date)
	.then(contestEntryDoc => {
		let contestEntry = contestEntryDoc.toObject();
		if (_.get(contestEntry, 'performance.daily', null) && contestEntry.performance.daily.length > 0) {
			return {advisor: contestEntry.advisor, pnlStats: contestEntry.performance.daily[0].pnlStats};
		} else {
			return null;
		}
	})
};
