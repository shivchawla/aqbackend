/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 17:38:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-15 20:31:58
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

function _updatePortfolioForAveragePrice(portfolioHistory) {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"update_dollar_portfolio_average_price", 
    								portfolioHistory: portfolioHistory});
        								
		WSHelper.handleMktRequest(msg, resolve, reject);

	});
}

function _updatePositionsForPrice(positions, type, date) {
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

module.exports.getUpdatedPortfolioForPrice = function(portfolio, typ) {
	
	return _updatePositionsForPrice(portfolio.positions, portfolio.date, typ)
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
		return _updatePositionsForPrice(_partialUpdatedPositions); //, "RT", portfolio.date);
	})
	.then(updatedPositions => {
		if (updatedPositions) {
			return _populateStats({positions: updatedPositions, cash: _.get(portfolio, 'cash', 0.0)});
		} else {
			return portfolio;
		}
	});
};

module.exports.getUpdatedPortfolio = function(portfolio) {
	return exports.getUpdatedPortfolioForAveragePrice(portfolio);
};

module.exports.getUpdatedContestEntry = function(entryId, date) {
	return DailyContestEntryModel.fetchEntryPortfolioForDate({_id: entryId}, date)
	.then(contestEntry => {
		return exports.getUpdatedPortfolio(contestEntry.portfolioDetail[0]);
	});
};

module.exports.updateContestEntryPnlStats = function(entryId, date) {
	return exports.getUpdatedContestEntry(entryId, date)
	.then(updatedContestEntry => {
		var pnlStats = _.get(updatedContestEntry, 'pnlStats', {});
		return DailyContestEntryModel.updateEntryPnlStats({_id: entryId}, pnlStats, date);
	});
};

module.exports.getContestEntryPnlStats = function(entryId, date) {
	return DailyContestEntryModel.fetchEntryPnlStatsForDate({_id: entryId}, date)
	.then(contestEntry => {
		if (_.get(contestEntry, 'performance.daily', null) && contestEntry.performance.daily.length > 0) {
			return {advisor: contestEntry.advisor, pnlStats: contestEntry.performance.daily[0].pnlStats};
		} else {
			APIError.throwJsonError({message: "No performance found"});
		}
	})
	
	
};
