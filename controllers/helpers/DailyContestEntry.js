/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 17:38:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-28 20:23:58
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');
const schedule = require('node-schedule');

const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');
const WSHelper = require('./WSHelper');
const SecurityHelper = require('./Security');

const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');

function _aggregatePnlStats(pnlStatsAllArray) {	
	return new Promise(resolve => {
		var totalPnl = 0.0;
		var totalPnlPct = 0.0;
		var totalPnl_long = 0.0;
		
		var totalPnlPct_long = 0.0;
		var totalPnl_short = 0.0;
		var totalPnlPct_short = 0.0;
		
		var cost = 0.0;
		var cost_long = 0.0;
		var cost_short = 0.0;

		var costPositive = 0, costPositive_long = 0, costPositive_short = 0,
			costNegative = 0, costNegative_long = 0, costNegative_short = 0;
		
		var netValue = 0.0;
		var netValue_long = 0.0;
		var netValue_short = 0.0;
		
		var grossValue = 0.0;
		var cash = 0.0
		
		var pnlPositive = 0;
		var pnlPositive_long = 0;
		var pnlPositive_short = 0;

		var pnlNegative = 0;
		var pnlNegative_long = 0;
		var pnlNegative_short = 0;

		var count = 0;
		var count_short = 0;
		var count_long = 0;
		
		var countPositive = 0;
		var countPositive_long = 0;
		var countPositive_short = 0;

		var countNegative = 0;
		var countNegative_long = 0;
		var countNegative_short = 0;

		var sumPnlPct = 0;
		var sumPnlPct_long = 0;
		var sumPnlPct_short = 0;

		var sumPnlPctPositive = 0;
		var sumPnlPctPositive_long = 0;
		var sumPnlPctPositive_short = 0;

		var sumPnlPctNegative = 0;
		var sumPnlPctNegative_long = 0;
		var sumPnlPctNegative_short = 0;

		var minPnl, maxPnl, minPnl_short, maxPnl_short, minPnl_long, maxPnl_long;

		var avgPnl, avgPnl_long, avgPnl_short, 
			avgPnlPositive, avgPnlPositive_long, avgPnlPositive_short,
			avgPnlPct, avgPnlPct_long, avgPnlPct_short,
			avgPnlPctPositive, avgPnlPctPositive_long, avgPnlPctPositive_short,
			avgPnlPctNegative, avgPnlPctNegative_long, avgPnlPctNegative_short
			pnlPctPositive, pnlPctPositive_long, pnlPctPositive_short,
			pnlPctNegative, pnlPctNegative_long, pnlPctNegative_short;

		pnlStatsAllArray.filter(item => item).forEach(item => {
			totalPnl += _.get(item, 'net.pnl', 0);
			totalPnl_long += _.get(item, 'long.pnl', 0);
			totalPnl_short += _.get(item, 'short.pnl', 0)
			
			cost += _.get(item, 'net.cost', 0);
			cost_long += _.get(item, 'long.cost', 0);
			cost_short += _.get(item, 'short.cost', 0);

			costPositive += _.get(item, 'net.costPositive', 0);
			costPositive_long += _.get(item, 'long.costPositive', 0);
			costPositive_short += _.get(item, 'short.costPositive', 0);	

			costNegative += _.get(item, 'net.costNegative', 0);
			costNegative_long += _.get(item, 'long.costNegative', 0);
			costNegative_short += _.get(item, 'short.costNegative', 0);			
			
			netValue += _.get(item, 'net.netValue', 0);
			netValue_long += _.get(item, 'long.netValue', 0);
			netValue_short += _.get(item, 'short.netValue', 0);
			
			grossValue += _.get(item, 'net.grossValue', 0);
			cash += _.get(item, 'net.cash', 0);
			
			pnlPositive += _.get(item, 'net.pnlPositive', 0);
			pnlNegative += _.get(item, 'net.pnlNegative', 0);
			pnlPositive_long += _.get(item, 'long.pnlPositive', 0);
			pnlNegative_long += _.get(item, 'long.pnlNegative', 0);
			pnlPositive_short += _.get(item, 'short.pnlPositive', 0);
			pnlNegative_short += _.get(item, 'short.pnlNegative', 0);

			count += _.get(item, 'net.count', 0);
			count_long += _.get(item, 'long.count', 0);
			count_short += _.get(item, 'short.count', 0);
			
			countPositive += _.get(item, 'net.countPositive', 0);
			countPositive_long += _.get(item, 'long.countPositive', 0);
			countPositive_short += _.get(item, 'short.countPositive', 0);

			countNegative += _.get(item, 'net.countNegative', 0);
			countNegative_long += _.get(item, 'long.countNegative', 0);
			countNegative_short += _.get(item, 'short.countNegative', 0);

			sumPnlPct += _.get(item, 'net.avgPnlPct', 0) * _.get(item, 'net.count', 0);
			sumPnlPct_long += _.get(item, 'long.avgPnlPct', 0) * _.get(item, 'long.count', 0);
			sumPnlPct_short += _.get(item, 'short.avgPnlPct', 0) * _.get(item, 'short.count', 0);

			sumPnlPctPositive += _.get(item, 'net.avgPnlPctPositive', 0) * _.get(item, 'net.countPositive', 0);;
			sumPnlPctPositive_long += _.get(item, 'long.avgPnlPctPositive', 0) * _.get(item, 'long.countPositive', 0);;
			sumPnlPctPositive_short += _.get(item, 'short.avgPnlPctPositive', 0) * _.get(item, 'short.countPositive', 0);;

			sumPnlPctNegative += _.get(item, 'net.avgPnlPctNegative', 0) * _.get(item, 'net.countNegative', 0);;
			sumPnlPctNegative_long += _.get(item, 'long.avgPnlPctNegative', 0) * _.get(item, 'long.countNegative', 0);;
			sumPnlPctNegative_short += _.get(item, 'short.avgPnlPctNegative', 0) * _.get(item, 'short.countNegative', 0);;
		
			if (!minPnl) {
				minPnl = _.get(item, 'net.minPnl', {});
			} else {
				minPnl = minPnl.value < _.get(item,'net.minPnl.value', 0) ? minPnl : _.get(item, 'net.minPnl', {});
			}

			if (!maxPnl) {
				maxPnl = _.get(item, 'net.maxPnl', {});
			} else {
				maxPnl = maxPnl.value > _.get(item, 'net.maxPnl.value', 0) ? maxPnl : _.get(item, 'net.maxPnl', {});
			}

			if (!minPnl_long) {
				minPnl_long = _.get(item, 'long.minPnl', {});
			} else {
				minPnl_long = minPnl_long.value < _.get(item, 'long.minPnl.value', 0) ? minPnl_long : _.get(item, 'long.minPnl', {});
			}

			if (!minPnl_short) {
				minPnl_short = _.get(item, 'short.minPnl', {});
			} else {
				minPnl_short = minPnl_short.value < _.get(item, 'short.minPnl.value', 0) ? minPnl_short : _.get(item, 'short.minPnl', {});
			}

			if (!maxPnl_long) {
				maxPnl_long = _.get(item, 'long.maxPnl', {});
			} else {
				maxPnl_long = maxPnl_long.value > _.get(item, 'long.maxPnl.value', 0) ? maxPnl_long : _.get(item, 'long.maxPnl', {});
			}

			if (!maxPnl_short) {
				maxPnl_short = _.get(item, 'short.maxPnl', {});
			} else {
				maxPnl_short = maxPnl_short.value > _.get(item, 'short.maxPnl.value', 0) ? maxPnl_short : _.get(item, 'short.maxPnl', {});
			}
		});

		totalPnlPct = cost > 0 ? totalPnl/cost : 0
		totalPnlPct_long = cost_long > 0 ? totalPnl_long/cost_long : 0;
		totalPnlPct_short = cost_short > 0 ? totalPnl_short/cost_short : 0;

		var profitFactor = pnlNegative > 0.0 ? pnlPositive/pnlNegative : pnlPositive > 0 ? NaN : 0;
		var profitFactor_long = pnlNegative_long > 0.0 ? pnlPositive_long/pnlNegative_long : pnlPositive_long > 0 ? NaN : 0;
		var profitFactor_short = pnlNegative_short > 0.0 ? pnlPositive_short/pnlNegative_short : pnlPositive_short > 0 ? NaN : 0;

		var winRatio = countNegative > 0 ? countPositive/countNegative : countPositive > 0 ? NaN : 0;
		var winRatio_long = countNegative_long > 0 ? countPositive_long/countNegative_long : countPositive_long > 0 ? NaN : 0;
		var winRatio_short = countNegative_short > 0 ? countPositive_short/countNegative_short : countPositive_short > 0 ? NaN : 0; 

		netValue += cash;
		grossValue += cash;

		var pnlPctPositive = costPositive > 0 ? pnlPositive/costPositive : 0;
		var pnlPctPositive_long = costPositive_long > 0 ? pnlPositive_long/costPositive_long : 0;
		var pnlPctPositive_short = costPositive_short > 0 ? pnlPositive_short/costPositive_short : 0;

		var pnlPctNegative = costNegative > 0 ? pnlNegative/costNegative : 0;
		var pnlPctNegative_long = costNegative_long > 0 ? pnlNegative_long/costNegative_long : 0;
		var pnlPctNegative_short = costNegative_short > 0 ? pnlNegative_short/costNegative_short : 0;
		
		var avgPnl = count > 0 ? totalPnl/count : 0;
		var avgPnl_long = count_long > 0 ? totalPnl_long/count_long : 0;
		var avgPnl_short = count_short > 0 ? totalPnl_short/count_short : 0;

		var avgPnlPositive = countPositive > 0 ? pnlPositive/count : 0;
		var avgPnlPositive_long = countPositive_long > 0 ? pnlPositive_long/countPositive_long : 0;
		var avgPnlPositive_short = countPositive_short > 0 ? pnlPositive_short/countPositive_short : 0;

		var avgPnlNegative = countNegative > 0 ? pnlNegative/count : 0;
		var avgPnlNegative_long = countNegative_long > 0 ? pnlNegative_long/countNegative_long : 0;
		var avgPnlNegative_short = countNegative_short > 0 ? pnlNegative_short/countNegative_short : 0;

		var avgPnlPct = count > 0 ? sumPnlPct/count : 0;
		var avgPnlPct_long = count_long > 0 ? sumPnlPct_long/count_long : 0;
		var avgPnlPct_short = count_short > 0 ? sumPnlPct_short/count_short : 0;

		var avgPnlPctPositive = countPositive > 0 ? sumPnlPctPositive/countPositive : 0;
		var avgPnlPctPositive_long = countPositive_long > 0 ? sumPnlPctPositive_long/countPositive_long : 0;
		var avgPnlPctPositive_short = countPositive_short > 0 ? sumPnlPctPositive_short/countPositive_short : 0;

		var avgPnlPctNegative = countNegative > 0 ? sumPnlPctNegative/countNegative : 0;
		var avgPnlPctNegative_long = countNegative_long > 0 ? sumPnlPctNegative_long/countNegative_long : 0;
		var avgPnlPctNegative_short = countNegative_short > 0 ? sumPnlPctNegative_short/countNegative_short : 0;

		var pnlStats = {
			net: {pnl: totalPnl, pnlPct: totalPnlPct, 
				cost, costPositive, costNegative, 
				cash, netValue, grossValue,
			 	minPnl, maxPnl, profitFactor, 
				pnlPositive, pnlNegative, winRatio,
				count, countPositive, countNegative,
				avgPnl, avgPnlPositive, avgPnlNegative,
				avgPnlPct, avgPnlPctPositive, avgPnlPctNegative,
				pnlPctPositive, pnlPctNegative},
			long: {pnl: totalPnl_long, pnlPct: totalPnlPct_long, 
				cost: cost_long, costPositive: costPositive_long,
				costNegative: costNegative_long,
				netValue: netValue_long, 
				cash: cash, minPnl: minPnl_long, 
				maxPnl: maxPnl_long, profitFactor: profitFactor_long, 
				pnlPositive: pnlPositive_long, pnlNegative: pnlNegative_long, 
				winRatio: winRatio_long, 
				count: count_long, countPositive: countPositive_long, countNegative: countNegative_long,
				avgPnl: avgPnl_long, avgPnlPositive: avgPnlPositive_long, avgPnlNegative: avgPnlNegative_long,
				avgPnlPct: avgPnlPct_long, avgPnlPctPositive: avgPnlPctPositive_long, avgPnlPctNegative: avgPnlPctNegative_long,
				pnlPctPositive: pnlPctPositive_long, pnlPctNegative: pnlPctNegative_long},
			short: {pnl: totalPnl_short, pnlPct: totalPnlPct_short, 
				cost: cost_short, costPositive: costPositive_short,
				costNegative: costNegative_short, 
				netValue: netValue_short, 
				cash: cash, minPnl: minPnl_short, 
				maxPnl: maxPnl_short, profitFactor: profitFactor_short, 
				pnlPositive: pnlPositive_short, pnlNegative: pnlNegative_short, winRatio: winRatio_short,
				count: count_short, countPositive: countPositive_short, countNegative: countNegative_short,
				avgPnl: avgPnl_short, avgPnlPositive: avgPnlPositive_short, avgPnlNegative: avgPnlNegative_short,
				avgPnlPct: avgPnlPct_short, avgPnlPctPositive: avgPnlPctPositive_short, avgPnlPctNegative: avgPnlPctNegative_short,
				pnlPctPositive: pnlPctPositive_short, pnlPctNegative: pnlPctNegative_short}
			};

		resolve(pnlStats);
	});
}

function _aggregatePnlStatsByTickers(pnlStatsByTickersArray) {	
	return new Promise(resolve => {

		let aggregatedStatsByTickers = {};
			//[{TCS:x}, {TCS:y}, {TCS: z}]
		
		var allTickers = [];	
		//?? How to filter the ticker for object
		pnlStatsByTickersArray.filter(item => item).forEach(item => {
			allTickers = allTickers.concat(Object.keys(item));
		});

		var uniqueTickers = _.uniq(allTickers);

		Promise.map(uniqueTickers, ticker => {
			var allPnlStatsForTicker = pnlStatsByTickersArray.map(item => {
				return _.get(item, `${ticker}`, null);
			}).filter(item => item);
			
			if (allPnlStatsForTicker.length > 1) {
				_aggregatePnlStats(allPnlStatsForTicker)
				.then(data => {
					aggregatedStatsByTickers[ticker] = data;
				});
			} else {
				aggregatedStatsByTickers[ticker] = allPnlStatsForTicker.length > 0 
					? allPnlStatsForTicker[0] 
					: {};
			}
		})
		
		resolve(aggregatedStatsByTickers);
	});
}

function _computePnlStats(portfolio, ticker) {
	return new Promise(resolve => {
		var totalPnl = 0.0;
		var totalPnlPct = 0.0;
		var totalPnl_long = 0.0;
		var totalPnlPct_long = 0.0;
		var totalPnl_short = 0.0;
		var totalPnlPct_short = 0.0;
		var cost = 0.0;
		var cost_long = 0.0;
		var cost_short = 0.0;
		
		var costPositive = 0;
		var costPositive_long = 0
		var costPositive_short = 0

		var costNegative = 0;
		var costNegative_long = 0
		var costNegative_short = 0

		var netValue = 0.0;
		var netValue_long = 0.0;
		var netValue_short = 0.0;
		
		var grossValue = 0.0;
		var cash = _.get(portfolio, 'cash', 0.0);
		
		var pnlPositive = 0;
		var pnlPositive_long = 0;
		var pnlPositive_short = 0;

		var pnlNegative = 0;
		var pnlNegative_long = 0;
		var pnlNegative_short = 0;

		var count = 0;
		var count_short = 0;
		var count_long = 0;
		
		var countPositive = 0;
		var countPositive_long = 0;
		var countPositive_short = 0;

		var countNegative = 0;
		var countNegative_long = 0;
		var countNegative_short = 0;

		var sumPnlPct = 0;
		var sumPnlPct_long = 0;
		var sumPnlPct_short = 0;

		var sumPnlPctPositive = 0;
		var sumPnlPctPositive_long = 0;
		var sumPnlPctPositive_short = 0;

		var sumPnlPctNegative = 0;
		var sumPnlPctNegative_long = 0;
		var sumPnlPctNegative_short = 0;

		var minPnl, maxPnl, minPnl_short, maxPnl_short, minPnl_long, maxPnl_long;

		portfolio.positions.filter(item => {return ticker ? item.security.ticker == ticker : true}).forEach(item => {

			var trueCost = item.investment;

			var _cv = item.avgPrice > 0.0 ? trueCost * (item.lastPrice/item.avgPrice) : trueCost;
			var currentValue = _cv + _.get(item, 'dividendCash', 0.0);
			
			var pnl = (currentValue - trueCost);
			var absCost = Math.abs(trueCost);

			var pnlPct = absCost > 0 ? pnl/absCost : 0;
			var pnlPct_long = trueCost > 0 ? pnl/absCost : 0 
			var pnlPct_short = trueCost < 0 ? pnl/absCost : 0;

			var pnlPctPositive = absCost > 0 ? (pnl > 0 ? pnl/absCost : 0) : 0;
			var pnlPctPositive_long = trueCost > 0 ? (pnl > 0 ? pnl/absCost : 0) : 0;
			var pnlPctPositive_short = trueCost < 0 ? (pnl > 0 ? pnl/absCost : 0) : 0;
	
			var pnlPctNegative = absCost > 0 ? (pnl < 0 ? Math.abs(pnl)/absCost : 0) : 0;
			var pnlPctNegative_long = trueCost > 0 ? (pnl < 0 ? Math.abs(pnl)/absCost : 0) : 0;
			var pnlPctNegative_short = trueCost < 0 ? (pnl < 0 ? Math.abs(pnl)/absCost : 0) : 0;

			cost += absCost;
			cost_long += trueCost > 0.0 ? absCost : 0.0;
			cost_short += trueCost < 0.0 ? absCost : 0.0;

			count += 1;
			count_long += trueCost > 0 ? 1 : 0;
			count_short += trueCost < 0 ? 1 : 0;

			totalPnl += pnl;
			totalPnl_long += trueCost > 0 ? pnl : 0.0;
			totalPnl_short += trueCost < 0 ? pnl : 0.0;

			sumPnlPct += pnlPct;
			sumPnlPct_long += pnlPct_long;
			sumPnlPct_short += pnlPct_short;

			sumPnlPctPositive += pnlPctPositive;
			sumPnlPctPositive_long += pnlPctPositive_long;
			sumPnlPctPositive_short += pnlPctPositive_short;
			
			sumPnlPctNegative += pnlPctNegative;
			sumPnlPctNegative_long += pnlPctNegative_long;
			sumPnlPctNegative_short += pnlPctNegative_short;
			
			costPositive += pnl > 0 ? absCost : 0.0;
			costPositive_long += trueCost > 0 ? (pnl > 0 ? absCost : 0.0) : 0.0;
			costPositive_short += trueCost < 0 ? (pnl > 0 ? absCost : 0.0) : 0.0;
			costNegative += pnl < 0 ? absCost : 0.0;
			costNegative_long += trueCost > 0 ? (pnl < 0 ? absCost : 0.0) : 0.0;
			costNegative_short += trueCost < 0 ? (pnl < 0 ? absCost : 0.0) : 0.0;

			countPositive += pnl > 0 ? 1 : 0.0;
			countPositive_long += trueCost > 0 ? (pnl > 0 ? 1 : 0.0) : 0.0;
			countPositive_short += trueCost < 0 ? (pnl > 0 ? 1 : 0.0) : 0.0;
			countNegative += pnl < 0 ? 1 : 0.0;
			countNegative_long += trueCost > 0 ? (pnl < 0 ? 1 : 0.0) : 0.0;
			countNegative_short += trueCost < 0 ? (pnl < 0 ? 1 : 0.0) : 0.0;

			pnlPositive += pnl > 0 ? pnl : 0.0;
			pnlPositive_long += trueCost > 0 ? (pnl > 0 ? pnl : 0.0) : 0.0;
			pnlPositive_short += trueCost < 0 ? (pnl > 0 ? pnl : 0.0) : 0.0;
			pnlNegative += pnl < 0 ? Math.abs(pnl) : 0.0;
			pnlNegative_long += trueCost > 0 ? (pnl < 0 ? Math.abs(pnl) : 0.0) : 0.0;
			pnlNegative_short += trueCost < 0 ? (pnl < 0 ? Math.abs(pnl) : 0.0) : 0.0;

			netValue += currentValue;
			grossValue += Math.abs(currentValue);
			netValue_long += trueCost > 0 ? Math.abs(currentValue) : 0.0;
			netValue_short += trueCost < 0 ? Math.abs(currentValue) : 0.0; 

			minPnl = minPnl ? 
						pnl < minPnl.value ? {security: item.security, value: pnl} : minPnl : 
					    {security: item.security, value: pnl};
			maxPnl = maxPnl ? 
						pnl > maxPnl.value ? {security: item.security, value: pnl} : maxPnl : 
						{security: item.security, value: pnl};


			if (trueCost < 0.0) {			
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

		var profitFactor = pnlNegative > 0.0 ? pnlPositive/pnlNegative : pnlPositive > 0 ? NaN : 0;
		var profitFactor_long = pnlNegative_long > 0.0 ? pnlPositive_long/pnlNegative_long : pnlPositive_long > 0 ? NaN : 0;
		var profitFactor_short = pnlNegative_short > 0.0 ? pnlPositive_short/pnlNegative_short : pnlPositive_short > 0 ? NaN : 0;

		var winRatio = countNegative > 0 ? countPositive/countNegative : countPositive > 0 ? NaN : 0;
		var winRatio_long = countNegative_long > 0 ? countPositive_long/countNegative_long : countPositive_long ? NaN : 0;
		var winRatio_short = countNegative_short > 0 ? countPositive_short/countNegative_short : countPositive_short ? NaN : 0; 

		totalPnlPct = cost > 0.0 ? totalPnl/cost : 0.0;
		totalPnlPct_long = cost_long > 0.0 ? totalPnl_long/cost_long : 0.0;
		totalPnlPct_short = cost_short > 0.0 ? totalPnl_short/cost_short : 0.0;

		var pnlPctPositive = costPositive > 0 ? pnlPositive/costPositive : 0;
		var pnlPctPositive_long = costPositive_long > 0 ? pnlPositive_long/costPositive_long : 0;
		var pnlPctPositive_short = costPositive_short > 0 ? pnlPositive_short/costPositive_short : 0;

		var pnlPctNegative = costNegative > 0 ? pnlNegative/costNegative : 0;
		var pnlPctNegative_long = costNegative_long > 0 ? pnlNegative_long/costNegative_long : 0;
		var pnlPctNegative_short = costNegative_short > 0 ? pnlNegative_short/costNegative_short : 0;
		
		var avgPnl = count > 0 ? totalPnl/count : 0;
		var avgPnl_long = count_long > 0 ? totalPnl_long/count_long : 0;
		var avgPnl_short = count_short > 0 ? totalPnl_short/count_short : 0;

		var avgPnlPositive = countPositive > 0 ? pnlPositive/count : 0;
		var avgPnlPositive_long = countPositive_long > 0 ? pnlPositive_long/countPositive_long : 0;
		var avgPnlPositive_short = countPositive_short > 0 ? pnlPositive_short/countPositive_short : 0;

		var avgPnlNegative = countNegative > 0 ? pnlNegative/count : 0;
		var avgPnlNegative_long = countNegative_long > 0 ? pnlNegative_long/countNegative_long : 0;
		var avgPnlNegative_short = countNegative_short > 0 ? pnlNegative_short/countNegative_short : 0;

		var avgPnlPct = count > 0 ? sumPnlPct/count : 0;
		var avgPnlPct_long = count_long > 0 ? sumPnlPct_long/count_long : 0;
		var avgPnlPct_short = count_short > 0 ? sumPnlPct_short/count_short : 0;

		var avgPnlPctPositive = countPositive > 0 ? sumPnlPctPositive/countPositive : 0;
		var avgPnlPctPositive_long = countPositive_long > 0 ? sumPnlPctPositive_long/countPositive_long : 0;
		var avgPnlPctPositive_short = countPositive_short > 0 ? sumPnlPctPositive_short/countPositive_short : 0;

		var avgPnlPctNegative = countNegative > 0 ? sumPnlPctNegative/countNegative : 0;
		var avgPnlPctNegative_long = countNegative_long > 0 ? sumPnlPctNegative_long/countNegative_long : 0;
		var avgPnlPctNegative_short = countNegative_short > 0 ? sumPnlPctNegative_short/countNegative_short : 0;

		var pnlStats = {
			net: {pnl: totalPnl, pnlPct: totalPnlPct, 
				cost, costPositive, costNegative, 
				cash, netValue, grossValue,
			 	minPnl, maxPnl, profitFactor, 
				pnlPositive, pnlNegative, winRatio,
				count, countPositive, countNegative,
				avgPnl, avgPnlPositive, avgPnlNegative,
				avgPnlPct, avgPnlPctPositive, avgPnlPctNegative,
				pnlPctPositive, pnlPctNegative},
			long: {pnl: totalPnl_long, pnlPct: totalPnlPct_long, 
				cost: cost_long, costPositive: costPositive_long,
				costNegative: costNegative_long,
				netValue: netValue_long, 
				cash: cash, minPnl: minPnl_long, 
				maxPnl: maxPnl_long, profitFactor: profitFactor_long, 
				pnlPositive: pnlPositive_long, pnlNegative: pnlNegative_long, 
				winRatio: winRatio_long, 
				count: count_long, countPositive: countPositive_long, countNegative: countNegative_long,
				avgPnl: avgPnl_long, avgPnlPositive: avgPnlPositive_long, avgPnlNegative: avgPnlNegative_long,
				avgPnlPct: avgPnlPct_long, avgPnlPctPositive: avgPnlPctPositive_long, avgPnlPctNegative: avgPnlPctNegative_long,
				pnlPctPositive: pnlPctPositive_long, pnlPctNegative: pnlPctNegative_long},
			short: {pnl: totalPnl_short, pnlPct: totalPnlPct_short, 
				cost: cost_short, costPositive: costPositive_short,
				costNegative: costNegative_short, 
				netValue: netValue_short, 
				cash: cash, minPnl: minPnl_short, 
				maxPnl: maxPnl_short, profitFactor: profitFactor_short, 
				pnlPositive: pnlPositive_short, pnlNegative: pnlNegative_short, winRatio: winRatio_short,
				count: count_short, countPositive: countPositive_short, countNegative: countNegative_short,
				avgPnl: avgPnl_short, avgPnlPositive: avgPnlPositive_short, avgPnlNegative: avgPnlNegative_short,
				avgPnlPct: avgPnlPct_short, avgPnlPctPositive: avgPnlPctPositive_short, avgPnlPctNegative: avgPnlPctNegative_short,
				pnlPctPositive: pnlPctPositive_short, pnlPctNegative: pnlPctNegative_short}
			};

		resolve(pnlStats);
	});
}

/*
* Populate pnl stats, netvalue, unrealized Pnl for the portfolio (and individual positions)
*/
function _getPnlStats(portfolio, byTicker=false) {
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

		if (byTicker) {
			var uniqueTickers = _.uniq(positions.map(item => item.security.ticker));

			return Promise.map(uniqueTickers, function(ticker) {
				return _computePnlStats(port, ticker)
				.then(pnlStats => {
					return {[ticker]: pnlStats};
				})
			})
			.then(pnlStatsByTicker => {
				resolve(pnlStatsByTicker.length > 0 ? Object.assign(...pnlStatsByTicker) : {});
			});
		} else {
			return _computePnlStats(port)
			.then(pnlStats => {
				resolve(pnlStats);
			});
		}
	});
}

function _isTargetAchieved(prediction, highPrice, lowPrice) {
	var investment = prediction.position.investment;
	var target = prediction.target;
	var avgPrice = prediction.position.avgPrice;

	let success = false;
	
	if (investment < 0 && lowPrice < target) {
		success = true
	} else if (investment > 0 && highPrice > target) {
		success = true; 
	}

	return success;
}

function _getExtremePrices(history, startDate) {
	var relevantHistory = history.filter(item => {return moment(`${item.datetime}Z`).isAfter(moment(startDate))});

	if (relevantHistory.length > 0) {
		return {
			high: _.maxBy(relevantHistory, 'high'), 
			low: _.minBy(relevantHistory, 'low')
		};
	} else {
		return {high: -Infinity, low: Infinity};
	}
}

function _trackIntradayHistory(security) {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"track_stock_intraday_detail", 
    								security: security});
        								
		WSHelper.handleMktRequest(msg, resolve, reject);

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
	var startDate = moment(prediction.startDate);
	var isAfterMarket = _.get(prediction, 'nonMarketHoursFlag', false);

	return Promise.all([
		SecurityHelper.getStockIntradayHistory(prediction.position.security),
		SecurityHelper.getStockDetail(prediction.position.security, prediction.startDate)
	])		
	.then(([intradaySecurityDetail, eodSecurityDetail]) => {
		
		if (isAfterMarket) {
			prediction.position.avgPrice = _.get(eodSecurityDetail, 'latestDetailRT.current', 0) || 			
											_.get(eodSecurityDetail, 'latestDetail.Close', 0);
		} else {

			var relevantIntradayHistory = intradaySecurityDetail.intradayHistory.filter(item => {return !moment(`${item.datetime}Z`).isBefore(startDate)});

			let trueLastPrice = 0.0;
			if (relevantIntradayHistory.length > 0) {
				trueLastPrice = relevantIntradayHistory[0].close;
			}

			prediction.position.avgPrice = trueLastPrice;
		}

		return prediction;
		
	});

	
}

function _updatePredictionForCallPrice(prediction) {
	var startDate = moment(prediction.startDate);
	
	return Promise.all([
		SecurityHelper.getStockIntradayHistory(prediction.position.security),
		SecurityHelper.getStockDetail(prediction.position.security, prediction.startDate)
	])
	.then(([intradaySecurityDetail, eodSecurityDetail]) => {
		
		if (_.get(prediction,'nonMarketHoursFlag', false)) {
			var lastPrice = _.get(eodSecurityDetail, 'latestDetailRT.current', 0) ||
			    _.get(eodSecurityDetail, 'latestDetailRT.close', 0) ||  
			    _.get(eodSecurityDetail, 'latestDetail.Close', 0);

			prediction.position.avgPrice = lastPrice;
		} else {
			var relevantIntradayHistory = intradaySecurityDetail.intradayHistory.filter(item => {
				
				return !moment(`${item.datetime}Z`).isBefore(startDate)
			});

			let trueLastPrice = 0.0;
			if (relevantIntradayHistory.length > 0) {
				trueLastPrice = relevantIntradayHistory[0].close;
			}

			var lastPrice = trueLastPrice ||
			    _.get(eodSecurityDetail, 'latestDetailRT.current', 0) ||
			    _.get(eodSecurityDetail, 'latestDetailRT.close', 0); 

			prediction.position.avgPrice = lastPrice;
		}

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
			
			return Promise.resolve(callPrice == 0 ? _updatePredictionForCallPrice(prediction) : prediction)
			.then(updatedCallPricePrediction => {
				var _partialUpdatedPositions = updatedCallPricePrediction ? [updatedCallPricePrediction.position] : [prediction.position];
				
				//Check whether the predcition needs any price update
				//Based on success status
				var success = _.get(prediction, 'success.status', false);
				if (success) {
					updatedCallPricePrediction.position.lastPrice = updatedCallPricePrediction.target;
					return [updatedCallPricePrediction.position];
				} else {
					return _updatePositionsForPrice(_partialUpdatedPositions, date);
				}
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

function _computeTotalPnlStats(advisorId, date, category="active") {
	
	return Promise.resolve()
	.then(() => {
		if (category == "all") { //All =  active + ending on date (doesn't include starting)	 

			var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;
			var useEndedPredictions = !isToday || (isToday && moment().isAfter(moment(DateHelper.getMarketCloseDateTime(date))));
			
			return Promise.all([
				useEndedPredictions ? exports.getPredictionsForDate(advisorId, date, "ended") : [],
				exports.getPredictionsForDate(advisorId, date, "active") //A
			])
			.then(([endedPredictions, activePredictions]) => {
				var allPredictions = endedPredictions.concat(activePredictions);
				return allPredictions;
			})
		} else {
			return exports.getPredictionsForDate(advisorId, date, category)
		}
	})
	.then(activePredictions => {

		var updatedPositions = activePredictions.map(item => {
			if(item.success.status) {
				item.position.lastPrice = item.target;
			}
			return  item.position;
		});
		//Total Pnl
		return Promise.all([
			_getPnlStats({positions: updatedPositions}),
			_getPnlStats({positions: updatedPositions}, true)
		])
		.then(([pnlStatsAll, pnlStatsByTicker]) => {
			return {
				all: pnlStatsAll,
				byTickers: pnlStatsByTicker
			};
		});
	})
};

function _computeTotalPnlStatsForAll(advisorId, date) {
	return Promise.all([
		_computeTotalPnlStats(advisorId, date, "started"),
		_computeTotalPnlStats(advisorId, date, "active"),
		_computeTotalPnlStats(advisorId, date, "ended")
	])
	.then(([startedPredictionsTotalPnl, activePredictionsTotalPnl, endedPredictionsTotalPnl]) => {
		return {
			started: startedPredictionsTotalPnl,
			active: activePredictionsTotalPnl,
			ended: endedPredictionsTotalPnl
		};
	});
}

function _computeDailyPnlStats(advisorId, date, category="active") {
	
	let yesterday = moment(date).subtract(1, 'days').toDate();

	return exports.getPredictionsForDate(advisorId, date, category)
	// .then(rawPredictions => {
	// 	//First change the startDate of all predictions before today to be yesterday
		
	// 	//THIS IS IRRELEVANT NOW --- as
	// 	// rawPredictions = rawPredictions.map(item => {
		
	// 	// 	//What's the significance of dailyPnL for entries starting today - ?
	// 	// 	//So don't update the startdate for those predictions		
	// 	// 	var startDateRoundedEOD = DateHelper.getMarketCloseDateTime(item.startDate);
			
	// 	// 	if(startDateRoundedEOD.isBefore(moment(date))) {
	// 	// 		item.startDate = yesterday;
	// 	// 	}

	// 	// 	return item;
	// 	// });

	// 	return _computeUpdatedPredictions(rawPredictions, date);
	// })
	.then(updatedPredictions => {
			
		//BUT THE updated predictions have Call price as of beginning of predicton
		//For Daily change, we need daily changes
		return Promise.map(updatedPredictions, function(prediction) {
			
			//What's the significance of dailyPnL for entries starting today - ?
			//So don't update the startdate for those predictions		
			let startDate = date;
			var startDateRoundedEOD = DateHelper.getMarketCloseDateTime(prediction.startDate);

			return Promise.resolve()
			.then(() => {
				return startDateRoundedEOD.isBefore(moment(date)) ? 
					SecurityHelper.getStockDetail(prediction.position.security, yesterday) :
					{}
			})
			.then(securityDetail => {
				prediction.position.avgPrice = _.get(securityDetail, 'latestDetailRT.close', 0)  ||
					_.get(securityDetail, 'latestDetail.Close', 0) || 
					prediction.position.avgPrice;

				return prediction;
			})
		})
		.then(updatedPredictionWithYesterdayCallPrice => {

			var updatedPositions = updatedPredictionWithYesterdayCallPrice.map(item => {
				if(item.success.status) {
					item.position.lastPrice = item.target;
				}
				return  item.position;
			});

			//Total Pnl
			return _getPnlStats({positions: updatedPositions});
		});
	});	
};

function _computeDailyPnlStatsForAll(advisorId, date) {
	return Promise.all([
		_computeDailyPnlStats(advisorId, date, "started"),
		_computeDailyPnlStats(advisorId, date, "active"),
		_computeDailyPnlStats(advisorId, date, "ended")
	])
	.then(([startedPredictionsDailyPnl, activePredictionsDailyPnl, endedPredictionsDailyPnl]) => {
		return {
			started: startedPredictionsDailyPnl,
			active: activePredictionsDailyPnl,
			ended: endedPredictionsDailyPnl
		};
	});
}

function _computeNetPnlStats(advisorId, date) {
	
	//Net Pnl = Sum of Realized pnl daily + latest unrealized pnl 
	return Promise.all([
		DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date),
		DailyContestEntryPerformanceModel.fetchLastPnlStats({advisor: advisorId}, date),
	])
	.then(([latestPnlStats, yesterdayPnlStats]) => {
		var latestActivePnlStats = _.get(latestPnlStats, 'detail.cumulative.active', {});
		var latestRealizedPnlStats = _.get(latestPnlStats, 'detail.cumulative.ended', {});
		var lastRealizedPnlStats = _.get(yesterdayPnlStats, 'net.realized', {});
		
		return Promise.all([
			_aggregatePnlStats([lastRealizedPnlStats.all, latestActivePnlStats.all]),
		    _aggregatePnlStatsByTickers([lastRealizedPnlStats.byTickers, latestActivePnlStats.byTickers]),
		    _aggregatePnlStats([lastRealizedPnlStats.all, latestRealizedPnlStats.all]),
		    _aggregatePnlStatsByTickers([lastRealizedPnlStats.byTickers, latestRealizedPnlStats.byTickers])
		])
		.then(([pnlStatsTotalAll, pnlStatsTotalByTicker, pnlStatsRealizedAll, pnlStatsRealizedByTicker]) => {
			return {
				realized: {all: pnlStatsRealizedAll, byTickers: pnlStatsRealizedByTicker},
				total: {
					all: pnlStatsTotalAll, 
					byTickers: pnlStatsTotalByTicker
				}
			};
		});
	});
}

// let baseDate = '2018-11-12';
// const dates = [];
// for (var i=0; i <= 10; i++ ) {
// 	const date = moment(baseDate).add(i, 'days').format('YYYY-MM-DD');
// 	dates.push(date);
// }
// Promise.mapSeries(dates, date => {
// 	// exports.updateAllEntriesLatestPnlStats(date)
// 	// .then(() => {
// 		return exports.updateAllEntriesNetPnlStats(DateHelper.getMarketCloseDateTime(date));
// 	// })
	
// });

module.exports.getValidStartDate = function(date) {
	
	let latestTradingDateIncludingToday = DateHelper.getMarketCloseDateTime(DateHelper.getPreviousNonHolidayWeekday(null, 0)); 
	let latestTradingDateExcludingToday = DateHelper.getMarketCloseDateTime(DateHelper.getPreviousNonHolidayWeekday(null, 1)); 
	
	let validStartDate;
	//On market holiday - get close of last day
	//12PM Sunday
	if (DateHelper.isHoliday(date)) {
		validStartDate = latestTradingDateExcludingToday;
	}
	//While trading
	else if (DateHelper.isMarketTrading()) {
        validStartDate = moment().startOf('minute');
	}  
	//After market close - get close of that day 
	//5:30 PM Friday
	else if (moment().isAfter(DateHelper.getMarketCloseDateTime())) {
		validStartDate = latestTradingDateIncludingToday;
	} 
	//Before market open - get close of last day 
	//5:30AM Friday
	else if (moment().isBefore(DateHelper.getMarketOpenDateTime())) {
		validStartDate = latestTradingDateExcludingToday;
	} else {
		console.log("Start Date can be erroneous!!")
		validStartDate = latestTradingDateExcludingToday;
	}

	return validStartDate;
};

module.exports.getTotalPnlStats = function(advisorId, date, category="active") {
	return DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date)
	.then(pnlStats => {
		if (pnlStats) {
			switch(category) {
				//HOW TO ADD CHECK FOR KEYS
				case "active" : return _.get(pnlStats,'detail.cumulative.active', null); break;
				case "ended" : return _.get(pnlStats, 'detail.cumulative.ended', null); break;
				case "started" : return _.get(pnlStats, 'detail.cumulative.started', null); break;
			}
		} else {
			return _computeTotalPnlStats(advisorId, date, category);
		}
	});	
};

module.exports.getDailyPnlStats = function(advisorId, date, category="active") {
	return DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date)
	.then(pnlStats => {
		if (pnlStats) {
			switch(category) {
				case "active" : return _.get(pnlStats, 'detail.daily.active', null); break;
				case "ended" : return _.get(pnlStats, 'detail.daily.ended', null); break;
				case "started" : return _.get(pnlStats, 'detail.daily.started', null); break;
			}
		} else {
			return _computeDailyPnlStats(advisorId, date, category);
		}
	});
};

module.exports.getPnlForDate = function(advisorId, date, category="active") {
	
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	return Promise.all([
		exports.getDailyPnlStats(advisorId, date, category),
		exports.getTotalPnlStats(advisorId, date, category)
	])
	.then(([dailyPnl, totalPnl]) => {
		return {daily: dailyPnl, cumulative: totalPnl};
	});
};

module.exports.getPredictionsForDate = function(advisorId, date, category='started', update=true) {
	
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

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
			case "active": return DailyContestEntryModel.fetchEntryPredictionsActiveOnDate({advisor: advisorId}, date); break;
			case "started": return DailyContestEntryModel.fetchEntryPredictionsStartedOnDate({advisor: advisorId}, date); break;
			case "ended": return DailyContestEntryModel.fetchEntryPredictionsEndedOnDate({advisor: advisorId}, date); break;
			
			//not used 
			case "all": return Promise.all([
							useEndedPredictions ? DailyContestEntryModel.fetchEntryPredictionsEndedOnDate({advisor: advisorId}, date) : [],
							DailyContestEntryModel.fetchEntryPredictionsActiveOnDate({advisor: advisorId}, date) //A
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
	.then(updatedPredictionsWithLastPrice => {

		//Update security latest detail
		if (update) {
			return Promise.map(updatedPredictionsWithLastPrice, function(prediction) {
				return SecurityHelper.getStockDetail(prediction.position.security, date)
				.then(securityDetail => {
					var updatedPosition = Object.assign(prediction.position, {security: securityDetail});
					return Object.assign({position: updatedPosition}, prediction);
				})
			});
		} else {
			return updatedPredictionsWithLastPrice;
		}
	});
};

module.exports.getContestEntryForUser = function(userId) {
	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			return DailyContestEntryModel.fetchEntry({advisor:advisor._id}, {fields:'_id'})
		} else {
			APIError.throwJsonError({msg: "Advisor not found. WS request can't be completed"});
		}
	})
};

module.exports.updateAllEntriesLatestPnlStats = function(date){
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisor) {
			let advisorId = advisor._id;
			return DailyContestEntryModel.countEntries({advisor: advisorId})
			.then(countEntries => {
				if (countEntries > 0) {
					date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
					return Promise.all([
						_computeTotalPnlStatsForAll(advisorId, date),
						_computeDailyPnlStatsForAll(advisorId, date)
					])
					.then(([totalPnl, dailyPnl]) => {
						const updates = {
							cumulative: totalPnl,
							daily: dailyPnl
						}
						
						return DailyContestEntryPerformanceModel.updatePnlStatsForDate({advisor: advisorId}, updates, date, "detail");
					})
				} else {
					return;
				}
			})

		});
	});
};




/**
 * Needs to be changed
 */
module.exports.updateAllEntriesNetPnlStats = function(date) {
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisor) {
			let advisorId = advisor._id
			return DailyContestEntryModel.countEntries({advisor: advisorId})
			.then(countEntries => {
				if (countEntries > 0){
					date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
					return _computeNetPnlStats(advisorId, date)
					.then(netPnlStats => {
						return DailyContestEntryPerformanceModel.updatePnlStatsForDate({advisor: advisorId}, netPnlStats, date, "net");
					})
				} else {
					return;
				}
			})
		});
	})
	.catch(err => {
		console.log('Error', err);
	})
};

//Logic works for all predictions except that started today
//Why??
//Because high/low prices are not time resolved
//and if a prediction is created today, it can't be compared to 
//today's high/low as it culd have happened before the creation time
//How do we fix it?

//Write a function to get the intraday price history for a stock
//or write a function to get high/low wrt start time
//Use it to resolve whether target is already achieved!!

//OR 
//Keep a track of target by prediction/entryId in a dictionary

//Current TCS price --- 1900
			//target          //entryId
//TCS       1905				xx
//TCS       1895 				xy
//TCS       1935                re
//TCS       1940				td   

//OR 

//Get all active predicitons, combine thenm get price per ticker and compare the price
//and filter ot the successful ones

//Handles only predictions ending today
module.exports.checkForPredictionTarget = function(category = "active") {
	const currentDate = DateHelper.getMarketCloseDateTime(DateHelper.getCurrentDate());

	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisor) {
			let advisorId = advisor._id;
			return exports.getPredictionsForDate(advisorId, currentDate, category, false)
			.then(predictions => {

				//Filter out already successful (in case)
				//And the ones with startDate today
				var currentDate = DateHelper.getCurrentDate();

				return predictions.filter(item => !item.success.status).map(item => {
						return {...item, advisorId: advisorId};
				});

			});

		})
		.then(allPredictionsByAdvisorIds => {
			//this is an array of array of predicitons
			//merge them
			var allPredictions = Array.prototype.concat.apply([], allPredictionsByAdvisorIds);

			var uniqueTickers = _.uniq(allPredictions.map(item => item.position.security.ticker));

			return Promise.mapSeries(uniqueTickers, function(ticker) {
				var allPredictionsByTicker = allPredictions.filter(item => {
					return item.position.security.ticker === ticker;
				});

				return new Promise(resolve => {

					//check if prediction are successful on daily high/low basis
					return SecurityHelper.getStockLatestDetailByType({ticker: ticker}, "RT")
					.then(securityDetail => {
						var highPrice = securityDetail.latestDetail.high;
						var lowPrice = securityDetail.latestDetail.low;

						var successfulPredictions = allPredictionsByTicker.filter(item => {
							var investment = item.position.investment;
							var target = item.target;

							return (investment > 0 && highPrice > target) || (investment < 0 && lowPrice < target);
						});

						//SHORTCUT
						//FIRST check which predictions are successful on daily high/low basis
						
						if (successfulPredictions.length > 0) {

							var successfulDayBasis = successfulPredictions.filter(item => {
								var isStartDateToday = DateHelper.compareDates(item.startDate, currentDate) == 0;
								return !isStartDateToday;	
							});

							var partiallySuccessfulIntraday =  successfulPredictions.filter(item => {
								var isStartDateToday = DateHelper.compareDates(item.startDate, currentDate) == 0;
								return isStartDateToday;	
							});

							let successfulIntraday;

							if (partiallySuccessfulIntraday.length > 0) {
								return SecurityHelper.getStockIntradayHistory({ticker: ticker})
								.then(securityDetail => {

									successfulIntraday = partiallySuccessfulIntraday.filter(item => {
										var investment = item.position.investment;
										var target = item.target;

										var startDate = item.startDate;
										var extremePricesSinceStartDate = _getExtremePrices(securityDetail.intradayHistory, startDate);

										var highPrice = extremePricesSinceStartDate.high.high;
										var lowPrice = extremePricesSinceStartDate.low.high;

										return (investment > 0 && highPrice > target) || (investment < 0 && lowPrice < target);

									});

									resolve(successfulDayBasis.concat(successfulIntraday));
								});
							} else {
								resolve(successfulDayBasis);
							}

						} else {
							resolve([]);
						}
							
					})
				
				})
				
			})
			.then(successfulPredictionByTickers => {
				var allSuccessfulPredictions = Array.prototype.concat.apply([], successfulPredictionByTickers);

				return Promise.mapSeries(allSuccessfulPredictions, function(prediction) {
					return DailyContestEntryModel.updatePredictionStatus({advisor: prediction.advisorId}, prediction);
				});
			});
		});
	})
};

module.exports.addPredictions = function(advisorId, predictions, date) {
	return DailyContestEntryModel.addEntryPredictions({advisor: advisorId, date: date}, predictions, {new:true, upsert: true, fields:'_id'})
	.then(() => {
		var currentDate = DateHelper.getCurrentDate();
		return Promise.mapSeries(predictions, function(prediction) {
			var isStartDateToday = DateHelper.compareDates(prediction.startDate, currentDate) == 0;
			if (isStartDateToday && DateHelper.isMarketTrading()) {
				return _trackIntradayHistory(prediction.position.security);				
			}
		})
	})	
};

module.exports.updateCallPriceForPredictions = function() {
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisor) {
			let advisorId = advisor._id;

			//LOGIC TO FIRST GET THE LATEST START DATE 
			//FOR WHICH TO UPDATE CALLPRICE
			//BECAUSE OF WEEKENDS AND HOLIDAYS,
			//START DATE IS NOT SAME AS CURRENT DATE
			//AND LOGIC BELOW WILL GIVE THE LATEST START DATE
			let latestDate = DateHelper.getMarketCloseDateTime(exports.getValidStartDate());

			return DailyContestEntryModel.fetchEntryPredictionsStartedOnDate({advisor: advisorId}, latestDate)
			.then(predictions => {
				if (predictions && predictions.length > 0) {
					
					var filteredPredictions = predictions.filter(item => {
						var callPrice = _.get(item, 'position.avgPrice', 0.0);
						return callPrice == 0;
					});
					
					return Promise.mapSeries(filteredPredictions, function(prediction) {
						return _updatePredictionForTrueCallPrice(prediction)
						.then(updatedPrediction => {
							var updatedCallPrice = _.get(updatedPrediction, 'position.avgPrice', 0.0);
							if (updatedCallPrice != 0) {
								return DailyContestEntryModel.updatePredictionCallPrice({advisor: advisorId}, prediction, updatedCallPrice);
							}
						});
					});	
				}
			});

		});
	})
};

/*
* Get aggregated general stats for predictions (all/bySymbol/byHorizon)
*/
module.exports.getDailyContestEntryPnlStats = function(advisorId, symbol, horizon) {
	return Promise.resolve()
	.then(() => {
		if (!symbol && !horizon) {
			return DailyContestEntryPerformanceModel.fetchLatestPnlStats({advisor: advisorId});
		} else if (symbol !== null){
			return DailyContestEntryPerformanceModel.fetchLatestPnlStatsForSymbol({advisor: advisorId}, symbol);
		} else {
			APIError.throwJsonError({msg:"oops"});
		}
	})
	.then(latestPnlStats => {
		if (latestPnlStats) {
			if (symbol !== null) {
				return latestPnlStats;
			} else {
				var netPnlStats =_.get(latestPnlStats, 'net', {});
				var keys = ["realized", "unrealized", "total"];
				const output = {};
				
				keys.forEach(key => {
					output[key] = _.get(netPnlStats, `${key}.all`, {});
				});

				return output;
			}
		} else {
			APIError.throwJsonError({msg: "No Pnl Stats"});
		}
	})
};