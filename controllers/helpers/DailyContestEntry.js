/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 17:38:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-28 11:42:44
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
const AdvisorHelper = require('./Advisor');

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

		var count = 0;
		var count_short = 0;
		var count_long = 0;
		
		var countPositive = 0;
		var countPositive_long = 0;
		var countPositive_short = 0;

		var countNegative = 0;
		var countNegative_long = 0;
		var countNegative_short = 0;

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

		////
		var sumMaxLossPct = 0;
		var sumMaxLossPct_long = 0;
		var sumMaxLossPct_short = 0;

		var sumMaxLossPctPositive = 0;
		var sumMaxLossPctPositive_long = 0;
		var sumMaxLossPctPositive_short = 0;

		var sumMaxLossPctNegative = 0;
		var sumMaxLossPctNegative_long = 0;
		var sumMaxLossPctNegative_short = 0;

		////
		var sumMaxGainPct = 0;
		var sumMaxGainPct_long = 0;
		var sumMaxGainPct_short = 0;

		var sumMaxGainPctPositive = 0;
		var sumMaxGainPctPositive_long = 0;
		var sumMaxGainPctPositive_short = 0;

		var sumMaxGainPctNegative = 0;
		var sumMaxGainPctNegative_long = 0;
		var sumMaxGainPctNegative_short = 0;

		///
		var sumHoldingPeriod = 0;
		var sumHoldingPeriod_long = 0;
		var sumHoldingPeriod_short = 0;

		var sumHoldingPeriodPositive = 0;
		var sumHoldingPeriodPositive_long = 0;
		var sumHoldingPeriodPositive_short = 0;

		var sumHoldingPeriodNegative = 0;
		var sumHoldingPeriodNegative_long = 0;
		var sumHoldingPeriodNegative_short = 0;

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

			sumPnlPctPositive += _.get(item, 'net.avgPnlPctPositive', 0) * _.get(item, 'net.countPositive', 0);
			sumPnlPctPositive_long += _.get(item, 'long.avgPnlPctPositive', 0) * _.get(item, 'long.countPositive', 0);
			sumPnlPctPositive_short += _.get(item, 'short.avgPnlPctPositive', 0) * _.get(item, 'short.countPositive', 0);

			sumPnlPctNegative += _.get(item, 'net.avgPnlPctNegative', 0) * _.get(item, 'net.countNegative', 0);
			sumPnlPctNegative_long += _.get(item, 'long.avgPnlPctNegative', 0) * _.get(item, 'long.countNegative', 0);
			sumPnlPctNegative_short += _.get(item, 'short.avgPnlPctNegative', 0) * _.get(item, 'short.countNegative', 0);

			//Sum of max loss
			sumMaxLossPct += _.get(item, 'net.avgMaxLossPct', 0) * _.get(item, 'net.count', 0);
			sumMaxLossPct_long += _.get(item, 'long.avgMaxLossPct', 0) * _.get(item, 'long.count', 0);
			sumMaxLossPct_short += _.get(item, 'short.avgMaxLossPct', 0) * _.get(item, 'short.count', 0);

			sumMaxLossPctPositive += _.get(item, 'net.avgMaxLossPctPositive', 0) * _.get(item, 'net.countPositive', 0);
			sumMaxLossPctPositive_long += _.get(item, 'long.avgMaxLossPctPositive', 0) * _.get(item, 'long.countPositive', 0);
			sumMaxLossPctPositive_short += _.get(item, 'short.avgMaxLossPctPositive', 0) * _.get(item, 'short.countPositive', 0);

			sumMaxLossPctNegative += _.get(item, 'net.avgMaxLossPctNegative', 0) * _.get(item, 'net.countNegative', 0);
			sumMaxLossPctNegative_long += _.get(item, 'long.avgMaxLossPctNegative', 0) * _.get(item, 'long.countNegative', 0);
			sumMaxLossPctNegative_short += _.get(item, 'short.avgMaxLossPctNegative', 0) * _.get(item, 'short.countNegative', 0);

			//Sum of max gain
			sumMaxGainPct += _.get(item, 'net.avgMaxGainPct', 0) * _.get(item, 'net.count', 0);
			sumMaxGainPct_long += _.get(item, 'long.avgMaxGainPct', 0) * _.get(item, 'long.count', 0);
			sumMaxGainPct_short += _.get(item, 'short.avgMaxGainPct', 0) * _.get(item, 'short.count', 0);

			sumMaxGainPctPositive += _.get(item, 'net.avgMaxGainPctPositive', 0) * _.get(item, 'net.countPositive', 0);
			sumMaxGainPctPositive_long += _.get(item, 'long.avgMaxGainPctPositive', 0) * _.get(item, 'long.countPositive', 0);
			sumMaxGainPctPositive_short += _.get(item, 'short.avgMaxGainPctPositive', 0) * _.get(item, 'short.countPositive', 0);

			sumMaxGainPctNegative += _.get(item, 'net.avgMaxGainPctNegative', 0) * _.get(item, 'net.countNegative', 0);
			sumMaxGainPctNegative_long += _.get(item, 'long.avgMaxGainPctNegative', 0) * _.get(item, 'long.countNegative', 0);
			sumMaxGainPctNegative_short += _.get(item, 'short.avgMaxGainPctNegative', 0) * _.get(item, 'short.countNegative', 0);

			//Sum of Holding period
			sumHoldingPeriod += _.get(item, 'net.avgHoldingPeriod', 0) * _.get(item, 'net.count', 0);
			sumHoldingPeriod_long += _.get(item, 'long.avgHoldingPeriod', 0) * _.get(item, 'long.count', 0);
			sumHoldingPeriod_short += _.get(item, 'short.avgHoldingPeriod', 0) * _.get(item, 'short.count', 0);

			sumHoldingPeriodPositive += _.get(item, 'net.avgHoldingPeriodPositive', 0) * _.get(item, 'net.countPositive', 0);
			sumHoldingPeriodPositive_long += _.get(item, 'long.avgHoldingPeriodPositive', 0) * _.get(item, 'long.countPositive', 0);
			sumHoldingPeriodPositive_short += _.get(item, 'short.avgHoldingPeriodPositive', 0) * _.get(item, 'short.countPositive', 0);

			sumHoldingPeriodNegative += _.get(item, 'net.avgHoldingPeriodNegative', 0) * _.get(item, 'net.countNegative', 0);
			sumHoldingPeriodNegative_long += _.get(item, 'long.avgHoldingPeriodNegative', 0) * _.get(item, 'long.countNegative', 0);
			sumHoldingPeriodNegative_short += _.get(item, 'short.avgHoldingPeriodNegative', 0) * _.get(item, 'short.countNegative', 0);

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

		var avgHoldingPeriod = count > 0 ? sumHoldingPeriod/count : 0;
		var avgHoldingPeriod_long = count_long > 0 ? sumHoldingPeriod_long/count_long : 0;
		var avgHoldingPeriod_short = count_short > 0 ? sumHoldingPeriod_short/count_short : 0;

		var avgHoldingPeriodPositive = countPositive > 0 ? sumHoldingPeriodPositive/countPositive : 0;
		var avgHoldingPeriodPositive_long = countPositive_long > 0 ? sumHoldingPeriodPositive_long/countPositive_long : 0;
		var avgHoldingPeriodPositive_short = countPositive_short > 0 ? sumHoldingPeriodPositive_short/countPositive_short : 0;

		var avgHoldingPeriodNegative = countNegative > 0 ? sumHoldingPeriodNegative/countNegative : 0;
		var avgHoldingPeriodNegative_long = countNegative_long > 0 ? sumHoldingPeriodNegative_long/countNegative_long : 0;
		var avgHoldingPeriodNegative_short = countNegative_short > 0 ? sumHoldingPeriodNegative_short/countNegative_short : 0;

		var avgMaxLossPct, avgMaxLossPct_long, avgMaxLossPct_short, 
			avgMaxLossPctPositive, avgMaxLossPctPositive_long, avgMaxLossPctPositive_short, 
			avgMaxLossPctNegative, avgMaxLossPctNegative_long, avgMaxLossPctNegative_short,
			avgMaxGainPct, avgMaxGainPct_long, avgMaxGainPct_short, 
			avgMaxGainPctPositive, avgMaxGainPctPositive_long, avgMaxGainPctPositive_short, 
			avgMaxGainPctNegative, avgMaxGainPctNegative_long, avgMaxGainPctNegative_short;
			
		//Compute averages of max gain
		avgMaxGainPct = count > 0 ? sumMaxGainPct/count : 0;
		avgMaxGainPct_long = count_long > 0 ? sumMaxGainPct_long/count_long : 0;
		avgMaxGainPct_short = count_short > 0 ? sumMaxGainPct_short/count_short : 0;

		avgMaxGainPctPositive = countPositive > 0 ? sumMaxGainPctPositive/countPositive : 0;
		avgMaxGainPctPositive_long = countPositive_long > 0 ? sumMaxGainPctPositive_long/countPositive_long : 0;
		avgMaxGainPctPositive_short = countPositive_short > 0 ? sumMaxGainPctPositive_short/countPositive_short : 0;

		avgMaxGainPctNegative = countNegative > 0 ? sumMaxGainPctNegative/countNegative : 0;
		avgMaxGainPctNegative_long = countNegative_long > 0 ? sumMaxGainPctNegative_long/countNegative_long : 0;
		avgMaxGainPctNegative_short = countNegative_short > 0 ? sumMaxGainPctNegative_short/countNegative_short : 0;
		
		//Compute averages of max loss
		avgMaxLossPct = count > 0 ? sumMaxLossPct/count : 0;
		avgMaxLossPct_long = count_long > 0 ? sumMaxLossPct_long/count_long : 0;
		avgMaxLossPct_short = count_short > 0 ? sumMaxLossPct_short/count_short : 0;

		avgMaxLossPctPositive = countPositive > 0 ? sumMaxLossPctPositive/countPositive : 0;
		avgMaxLossPctPositive_long = countPositive_long > 0 ? sumMaxLossPctPositive_long/countPositive_long : 0;
		avgMaxLossPctPositive_short = countPositive_short > 0 ? sumMaxLossPctPositive_short/countPositive_short : 0;

		avgMaxLossPctNegative = countNegative > 0 ? sumMaxLossPctNegative/countNegative : 0;
		avgMaxLossPctNegative_long = countNegative_long > 0 ? sumMaxLossPctNegative_long/countNegative_long : 0;
		avgMaxLossPctNegative_short = countNegative_short > 0 ? sumMaxLossPctNegative_short/countNegative_short : 0;

		var pnlStats = {
			net: {pnl: totalPnl, pnlPct: totalPnlPct, 
				pnlPctPositive, pnlPctNegative,
				cost, costPositive, costNegative, 
				cash, netValue, grossValue,
			 	minPnl, maxPnl, profitFactor, 
				pnlPositive, pnlNegative, winRatio,
				count, countPositive, countNegative,
				avgPnl, avgPnlPositive, avgPnlNegative,
				
				avgPnlPct, avgPnlPctPositive, avgPnlPctNegative,
				
				avgMaxLossPct, avgMaxLossPctPositive, avgMaxLossPctNegative,
				avgMaxGainPct, avgMaxGainPctPositive, avgMaxGainPctNegative,

				avgHoldingPeriod, avgHoldingPeriodPositive, avgHoldingPeriodNegative},
			long: {pnl: totalPnl_long, pnlPct: totalPnlPct_long,
				pnlPctPositive: pnlPctPositive_long, pnlPctNegative: pnlPctNegative_long, 
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
				
				avgMaxLossPct: avgMaxLossPct_long, avgMaxLossPctPositive: avgMaxLossPctPositive_long, avgMaxLossPctNegative: avgMaxLossPctNegative_long,
				avgMaxGainPct: avgMaxGainPct_long, avgMaxGainPctPositive: avgMaxGainPctPositive_long, avgMaxGainPctNegative: avgMaxGainPctNegative_long,
				
				avgHoldingPeriod: avgHoldingPeriod_long , avgHoldingPeriodPositive: avgHoldingPeriodPositive_long, avgHoldingPeriodNegative: avgHoldingPeriodNegative_long},
			short: {pnl: totalPnl_short, pnlPct: totalPnlPct_short,
				pnlPctPositive: pnlPctPositive_short, pnlPctNegative: pnlPctNegative_short, 
				cost: cost_short, costPositive: costPositive_short,
				costNegative: costNegative_short, 
				netValue: netValue_short, 
				cash: cash, minPnl: minPnl_short, 
				maxPnl: maxPnl_short, profitFactor: profitFactor_short, 
				pnlPositive: pnlPositive_short, pnlNegative: pnlNegative_short, winRatio: winRatio_short,
				count: count_short, countPositive: countPositive_short, countNegative: countNegative_short,
				avgPnl: avgPnl_short, avgPnlPositive: avgPnlPositive_short, avgPnlNegative: avgPnlNegative_short,
				
				avgPnlPct: avgPnlPct_short, avgPnlPctPositive: avgPnlPctPositive_short, avgPnlPctNegative: avgPnlPctNegative_short,
				
				avgMaxLossPct: avgMaxLossPct_short, avgMaxLossPctPositive: avgMaxLossPctPositive_short, avgMaxLossPctNegative: avgMaxLossPctNegative_short,
				avgMaxGainPct: avgMaxGainPct_short, avgMaxGainPctPositive: avgMaxGainPctPositive_short, avgMaxGainPctNegative: avgMaxGainPctNegative_short,
				
				avgHoldingPeriod: avgHoldingPeriod_short , avgHoldingPeriodPositive: avgHoldingPeriodPositive_short, avgHoldingPeriodNegative: avgHoldingPeriodNegative_short}
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

function _computePnlStats(predictions, date, ticker=null) {
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
		var cash = 0; 
		
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
		
		////
		var sumMaxLossPct = 0;
		var sumMaxLossPct_long = 0;
		var sumMaxLossPct_short = 0;

		var sumMaxLossPctPositive = 0;
		var sumMaxLossPctPositive_long = 0;
		var sumMaxLossPctPositive_short = 0;

		var sumMaxLossPctNegative = 0;
		var sumMaxLossPctNegative_long = 0;
		var sumMaxLossPctNegative_short = 0;

		////
		var sumMaxGainPct = 0;
		var sumMaxGainPct_long = 0;
		var sumMaxGainPct_short = 0;

		var sumMaxGainPctPositive = 0;
		var sumMaxGainPctPositive_long = 0;
		var sumMaxGainPctPositive_short = 0;

		var sumMaxGainPctNegative = 0;
		var sumMaxGainPctNegative_long = 0;
		var sumMaxGainPctNegative_short = 0;

		////
		var sumHoldingPeriod = 0;
		var sumHoldingPeriod_long = 0;
		var sumHoldingPeriod_short = 0;

		var sumHoldingPeriodPositive = 0;
		var sumHoldingPeriodPositive_long = 0;
		var sumHoldingPeriodPositive_short = 0;

		var sumHoldingPeriodNegative = 0;
		var sumHoldingPeriodNegative_long = 0;
		var sumHoldingPeriodNegative_short = 0;

		var minPnl, maxPnl, minPnl_short, maxPnl_short, minPnl_long, maxPnl_long;

		predictions.filter(item => {return ticker ? _.get(item, 'position.security.ticker', "") == ticker : true}).forEach(item => {

			var pos = item.position;

			var startDate = item.startDate;
			var predictionEndDate = item.status.date ||  item.endDate;
			
			var endDate = moment(date).isBefore(moment(predictionEndDate)) ? date : predictionEndDate;
			var holdingPeriod = DateHelper.getTradingDays(startDate, endDate);

			var trueCost = pos.investment;

			var _cv = pos.avgPrice > 0.0 ? trueCost * (pos.lastPrice/pos.avgPrice) : trueCost;
			var currentValue = _cv + _.get(pos, 'dividendCash', 0.0);
			
			var pnl = (currentValue - trueCost);
			var absCost = Math.abs(trueCost);

			var intervalHigh = _.get(item, 'priceInterval.highPrice', -Infinity);
			var intervalLow = _.get(item, 'priceInterval.lowPrice', Infinity);

			var minValue = pos.avgPrice > 0.0 ? 
				trueCost * ((trueCost > 0 ? intervalLow : intervalHigh)/pos.avgPrice) : trueCost;

			var maxValue = pos.avgPrice > 0.0 ? 
				trueCost * ((trueCost > 0 ? intervalHigh : intervalLow)/pos.avgPrice) : trueCost;

			//Maximum gain/loss based on interval pricing
			var maxLoss = Math.abs(Math.min(0, minValue - trueCost));
			var maxGain = Math.max(0, maxValue - trueCost);

			var maxGainPct = maxGain/absCost;
			var maxLossPct = maxLoss/absCost;

			var pnlPct = absCost > 0 ? pnl/absCost : 0;
			var pnlPct_long = trueCost > 0 ? pnl/absCost : 0 
			var pnlPct_short = trueCost < 0 ? pnl/absCost : 0;

			var pnlPctPositive = absCost > 0 ? (pnl > 0 ? pnl/absCost : 0) : 0;
			var pnlPctPositive_long = trueCost > 0 ? (pnl > 0 ? pnl/absCost : 0) : 0;
			var pnlPctPositive_short = trueCost < 0 ? (pnl > 0 ? pnl/absCost : 0) : 0;
	
			var pnlPctNegative = absCost > 0 ? (pnl < 0 ? Math.abs(pnl)/absCost : 0) : 0;
			var pnlPctNegative_long = trueCost > 0 ? (pnl < 0 ? Math.abs(pnl)/absCost : 0) : 0;
			var pnlPctNegative_short = trueCost < 0 ? (pnl < 0 ? Math.abs(pnl)/absCost : 0) : 0;

			//HoldingPeriod
			var holdingPeriod_long = trueCost > 0 ? holdingPeriod : 0;
			var holdingPeriod_short = trueCost < 0 ? holdingPeriod : 0;

			var holdingPeriodPositive = pnl > 0 ? holdingPeriod : 0;
			var holdingPeriodPositive_long = trueCost > 0 ? (pnl > 0 ? holdingPeriod : 0) : 0;
			var holdingPeriodPositive_short = trueCost < 0 ? (pnl > 0 ? holdingPeriod : 0) : 0;

			var holdingPeriodNegative = pnl < 0 ? holdingPeriod : 0;
			var holdingPeriodNegative_long = trueCost > 0 ? (pnl < 0 ? holdingPeriod : 0) : 0;
			var holdingPeriodNegative_short = trueCost < 0 ? (pnl < 0 ? holdingPeriod : 0) : 0;

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

			//Sum of holding periods
			sumHoldingPeriod += holdingPeriod;
			sumHoldingPeriod_long += holdingPeriod_long;
			sumHoldingPeriod_short += holdingPeriod_short;

			sumHoldingPeriodPositive += holdingPeriodPositive;
			sumHoldingPeriodPositive_long += holdingPeriodPositive_long;
			sumHoldingPeriodPositive_short += holdingPeriodPositive_short;

			sumHoldingPeriodNegative += holdingPeriodNegative;
			sumHoldingPeriodNegative_long += holdingPeriodNegative_long;
			sumHoldingPeriodNegative_short += holdingPeriodNegative_short;
			
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

			//Sum of max loss/max gain
			sumMaxGainPct += maxGainPct
			sumMaxGainPct_long += trueCost > 0 ? maxGainPct : 0;
			sumMaxGainPct_short += trueCost < 0 ? maxGainPct : 0;

			sumMaxGainPctPositive += pnl > 0 ? maxGainPct : 0;
			sumMaxGainPctPositive_long += trueCost > 0 ? (pnl > 0 ? maxGainPct : 0) : 0;
			sumMaxGainPctPositive_short += trueCost < 0 ? (pnl > 0 ? maxGainPct : 0) : 0;

			sumMaxGainPctNegative += pnl < 0 ? maxGainPct : 0;
			sumMaxGainPctNegative_long += trueCost > 0 ? (pnl < 0 ? maxGainPct : 0) : 0;
			sumMaxGainPctNegative_short += trueCost > 0 ? (pnl < 0 ? maxGainPct : 0) : 0;

			sumMaxLossPct += maxLossPct
			sumMaxLossPct_long += trueCost > 0 ? maxLossPct : 0;
			sumMaxLossPct_short += trueCost < 0 ? maxLossPct : 0;

			sumMaxLossPctPositive += pnl > 0 ? maxLossPct : 0;
			sumMaxLossPctPositive_long += trueCost > 0 ? (pnl > 0 ? maxLossPct : 0) : 0;
			sumMaxLossPctPositive_short += trueCost < 0 ? (pnl > 0 ? maxLossPct : 0) : 0;

			sumMaxLossPctNegative += pnl < 0 ? maxLossPct : 0;
			sumMaxLossPctNegative_long += trueCost > 0 ? (pnl < 0 ? maxLossPct : 0) : 0;
			sumMaxLossPctNegative_short += trueCost > 0 ? (pnl < 0 ? maxLossPct : 0) : 0;

			/////
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
						pnl < minPnl.value ? {security: pos.security, value: pnl} : minPnl : 
					    {security: pos.security, value: pnl};
			maxPnl = maxPnl ? 
						pnl > maxPnl.value ? {security: pos.security, value: pnl} : maxPnl : 
						{security: pos.security, value: pnl};


			if (trueCost < 0.0) {			
				minPnl_short = minPnl_short ? 
					pnl < minPnl_short.value ? {security: pos.security, value: pnl} : minPnl_short : 
				    {security: pos.security, value: pnl};
		    	maxPnl_short = maxPnl_short ? 
					pnl > maxPnl_short.value ? {security: pos.security, value: pnl} : maxPnl_short : 
					{security: pos.security, value: pnl};

		    } else {
				minPnl_long = minPnl_long ? 
					pnl < minPnl_long.value ? {security: pos.security, value: pnl} : minPnl_long : 
				    {security: pos.security, value: pnl};
		    	maxPnl_long = maxPnl_long ? 
					pnl > maxPnl_long.value ? {security: pos.security, value: pnl} : maxPnl_long : 
					{security: pos.security, value: pnl};
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

		//Average PnlPct
		var avgPnlPct = count > 0 ? sumPnlPct/count : 0;
		var avgPnlPct_long = count_long > 0 ? sumPnlPct_long/count_long : 0;
		var avgPnlPct_short = count_short > 0 ? sumPnlPct_short/count_short : 0;

		var avgPnlPctPositive = countPositive > 0 ? sumPnlPctPositive/countPositive : 0;
		var avgPnlPctPositive_long = countPositive_long > 0 ? sumPnlPctPositive_long/countPositive_long : 0;
		var avgPnlPctPositive_short = countPositive_short > 0 ? sumPnlPctPositive_short/countPositive_short : 0;

		var avgPnlPctNegative = countNegative > 0 ? sumPnlPctNegative/countNegative : 0;
		var avgPnlPctNegative_long = countNegative_long > 0 ? sumPnlPctNegative_long/countNegative_long : 0;
		var avgPnlPctNegative_short = countNegative_short > 0 ? sumPnlPctNegative_short/countNegative_short : 0;

		var avgMaxLossPct, avgMaxLossPct_long, avgMaxLossPct_short, 
			avgMaxLossPctPositive, avgMaxLossPctPositive_long, avgMaxLossPctPositive_short, 
			avgMaxLossPctNegative, avgMaxLossPctNegative_long, avgMaxLossPctNegative_short,
			avgMaxGainPct, avgMaxGainPct_long, avgMaxGainPct_short, 
			avgMaxGainPctPositive, avgMaxGainPctPositive_long, avgMaxGainPctPositive_short, 
			avgMaxGainPctNegative, avgMaxGainPctNegative_long, avgMaxGainPctNegative_short;
			
		//Compute averages of max gain
		avgMaxGainPct = count > 0 ? sumMaxGainPct/count : 0;
		avgMaxGainPct_long = count_long > 0 ? sumMaxGainPct_long/count_long : 0;
		avgMaxGainPct_short = count_short > 0 ? sumMaxGainPct_short/count_short : 0;

		avgMaxGainPctPositive = countPositive > 0 ? sumMaxGainPctPositive/countPositive : 0;
		avgMaxGainPctPositive_long = countPositive_long > 0 ? sumMaxGainPctPositive_long/countPositive_long : 0;
		avgMaxGainPctPositive_short = countPositive_short > 0 ? sumMaxGainPctPositive_short/countPositive_short : 0;

		avgMaxGainPctNegative = countNegative > 0 ? sumMaxGainPctNegative/countNegative : 0;
		avgMaxGainPctNegative_long = countNegative_long > 0 ? sumMaxGainPctNegative_long/countNegative_long : 0;
		avgMaxGainPctNegative_short = countNegative_short > 0 ? sumMaxGainPctNegative_short/countNegative_short : 0;
		
		//Compute averages of max loss
		avgMaxLossPct = count > 0 ? sumMaxLossPct/count : 0;
		avgMaxLossPct_long = count_long > 0 ? sumMaxLossPct_long/count_long : 0;
		avgMaxLossPct_short = count_short > 0 ? sumMaxLossPct_short/count_short : 0;

		avgMaxLossPctPositive = countPositive > 0 ? sumMaxLossPctPositive/countPositive : 0;
		avgMaxLossPctPositive_long = countPositive_long > 0 ? sumMaxLossPctPositive_long/countPositive_long : 0;
		avgMaxLossPctPositive_short = countPositive_short > 0 ? sumMaxLossPctPositive_short/countPositive_short : 0;

		avgMaxLossPctNegative = countNegative > 0 ? sumMaxLossPctNegative/countNegative : 0;
		avgMaxLossPctNegative_long = countNegative_long > 0 ? sumMaxLossPctNegative_long/countNegative_long : 0;
		avgMaxLossPctNegative_short = countNegative_short > 0 ? sumMaxLossPctNegative_short/countNegative_short : 0;

		var avgHoldingPeriod = count > 0 ? sumHoldingPeriod/count : 0
		var avgHoldingPeriod_long = count_long > 0 ? sumHoldingPeriod_long/count_long : 0;
		var avgHoldingPeriod_short = count_short > 0 ? sumHoldingPeriod_short/count_short : 0;

		var avgHoldingPeriodPositive = countPositive > 0 ? sumHoldingPeriodPositive/countPositive : 0;
		var avgHoldingPeriodPositive_long = countPositive_long > 0 ? sumHoldingPeriodPositive_long/countPositive_long : 0;
		var avgHoldingPeriodPositive_short = countPositive_short > 0 ? sumHoldingPeriodPositive_short/countPositive_short : 0;

		var avgHoldingPeriodNegative = countNegative > 0 ? sumHoldingPeriodNegative/countNegative : 0;
		var avgHoldingPeriodNegative_long = countNegative_long > 0 ? sumHoldingPeriodNegative_long/countNegative_long : 0;
		var avgHoldingPeriodNegative_short = countNegative_short > 0 ? sumHoldingPeriodNegative_short/countNegative_short : 0;

		var pnlStats = {
			net: {pnl: totalPnl, pnlPct: totalPnlPct, 
				pnlPctPositive, pnlPctNegative, 
				cost, costPositive, costNegative, 
				cash, netValue, grossValue,
			 	minPnl, maxPnl, profitFactor, 
				pnlPositive, pnlNegative, winRatio,
				count, countPositive, countNegative,
				avgPnl, avgPnlPositive, avgPnlNegative,

				avgPnlPct, avgPnlPctPositive, avgPnlPctNegative,

				avgMaxLossPct, avgMaxLossPctPositive, avgMaxLossPctNegative,
				avgMaxGainPct, avgMaxGainPctPositive, avgMaxGainPctNegative,
				
				avgHoldingPeriod, avgHoldingPeriodPositive, avgHoldingPeriodNegative},
			long: {pnl: totalPnl_long, pnlPct: totalPnlPct_long,
				pnlPctPositive: pnlPctPositive_long, pnlPctNegative: pnlPctNegative_long, 
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
				
				avgMaxLossPct: avgMaxLossPct_long, avgMaxLossPctPositive: avgMaxLossPctPositive_long, avgMaxLossPctNegative: avgMaxLossPctNegative_long,
				avgMaxGainPct: avgMaxGainPct_long, avgMaxGainPctPositive: avgMaxGainPctPositive_long, avgMaxGainPctNegative: avgMaxGainPctNegative_long,

				avgHoldingPeriod: avgHoldingPeriod_long , avgHoldingPeriodPositive: avgHoldingPeriodPositive_long, avgHoldingPeriodNegative: avgHoldingPeriodNegative_long},
			short: {pnl: totalPnl_short, pnlPct: totalPnlPct_short,
				pnlPctPositive: pnlPctPositive_short, pnlPctNegative: pnlPctNegative_short, 
				cost: cost_short, costPositive: costPositive_short,
				costNegative: costNegative_short, 
				netValue: netValue_short, 
				cash: cash, minPnl: minPnl_short, 
				maxPnl: maxPnl_short, profitFactor: profitFactor_short, 
				pnlPositive: pnlPositive_short, pnlNegative: pnlNegative_short, winRatio: winRatio_short,
				count: count_short, countPositive: countPositive_short, countNegative: countNegative_short,
				avgPnl: avgPnl_short, avgPnlPositive: avgPnlPositive_short, avgPnlNegative: avgPnlNegative_short,
				
				avgPnlPct: avgPnlPct_short, avgPnlPctPositive: avgPnlPctPositive_short, avgPnlPctNegative: avgPnlPctNegative_short,
				
				avgMaxLossPct: avgMaxLossPct_short, avgMaxLossPctPositive: avgMaxLossPctPositive_short, avgMaxLossPctNegative: avgMaxLossPctNegative_short,
				avgMaxGainPct: avgMaxGainPct_short, avgMaxGainPctPositive: avgMaxGainPctPositive_short, avgMaxGainPctNegative: avgMaxGainPctNegative_short,
				
				avgHoldingPeriod: avgHoldingPeriod_short , avgHoldingPeriodPositive: avgHoldingPeriodPositive_short, avgHoldingPeriodNegative: avgHoldingPeriodNegative_short}
			};

		resolve(pnlStats);
	});
}

/*
* Populate pnl stats, netvalue, unrealized Pnl for the portfolio (and individual positions)
*/
function _getPnlStats(predictions, date, byTickers = false) {
	
	return new Promise(resolve => {
		
		var positions = predictions.map(item => item.position).filter(item => item);

		if (byTickers) {
			var uniqueTickers = _.uniq(positions.map(item => item.security.ticker));

			return Promise.map(uniqueTickers, function(ticker) {
				return _computePnlStats(predictions, date, ticker)
				.then(pnlStats => {
					return {[ticker]: pnlStats};
				})
			})
			.then(pnlStatsByTicker => {
				resolve(pnlStatsByTicker.length > 0 ? Object.assign(...pnlStatsByTicker) : {});
			});
		} else {
			return _computePnlStats(predictions, date, null)
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

function _getExtremePrices(history, startDate, endDate) {
	var relevantHistory = history.filter(item => {var dt = item.datetime; return moment(dt).isAfter(moment(startDate)) && !moment(dt).isAfter(moment(endDate))});

	if (relevantHistory.length > 0) {
		var highPriceDetail = _.maxBy(relevantHistory, 'high');
		var lowPriceDetail = _.minBy(relevantHistory, 'low');

		return {
			high: {price: _.get(highPriceDetail, 'high', -Infinity), datetime: _.get(highPriceDetail, 'datetime', null)}, 
			low: {price: _.get(lowPriceDetail, 'low', -Infinity), datetime: _.get(lowPriceDetail, 'datetime', null)} 
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

			var relevantIntradayHistory = intradaySecurityDetail.intradayHistory.filter(item => {return !moment(item.datetime).isBefore(startDate)});

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
				
				return !moment(item.datetime).isBefore(startDate)
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
				var success = _.get(prediction, 'status.profitTarget', false) && moment(date).isSame(moment(prediction.status.date));
				var failure = _.get(prediction, 'status.stopLoss', false) && moment(date).isSame(moment(prediction.status.date));
				var manualExit = _.get(prediction, 'status.manualExit', false) && moment(date).isSame(moment(prediction.status.date));
				var lastPrice = _.get(prediction, 'position.lastPrice', 0);

				if (success) {
					
					updatedCallPricePrediction.position.lastPrice = updatedCallPricePrediction.target;
					return [updatedCallPricePrediction.position];
				
				} else if (failure) {
					
					var stopLossDirection = updatedCallPricePrediction.position.investment > 0 ? -1 : 1;
					var stopLoss = Math.abs(_.get(prediction, 'stopLoss', 1));
					var stopLossPrice = (1+stopLossDirection*stopLoss)*updatedCallPricePrediction.position.avgPrice;
					updatedCallPricePrediction.position.lastPrice = stopLossPrice;
					
					return [updatedCallPricePrediction.position];
				
				} else if(manualExit && lastPrice) {
					//On manual exit the price is already populated at the time of exit (DELAYED)
					//Last Price is populated via job
					//But if price is not available, then move to next step and return current price
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

function _computeTotalPnlStats(advisorId, date, options) {
	const category = _.get(options, 'category', "all");

	return exports.getPredictionsForDate(advisorId, date, options)
	.then(predictions => {

		var updatedPredictions = predictions.map(item => {

			var success = _.get(item, 'status.profitTarget', false) && moment(date).isSame(moment(item.status.date));
			var failure = _.get(item, 'status.stopLoss', false) && moment(date).isSame(moment(item.status.date));
			var manualExit = _.get(item, 'status.manualExit', false) && moment(date).isSame(moment(item.status.date));
				
			if(success) {
				item.position.lastPrice = item.target;
			} else if(failure) {

				var stopLossDirection = item.position.investment > 0 ? -1 : 1;
				var stopLoss = Math.abs(_.get(item, 'stopLoss', 1));

				var stopLossPrice = (1+stopLossDirection*stopLoss)*item.position.avgPrice;
				item.position.lastPrice = stopLossPrice;
			} 

			return  item;
		});
		//Total Pnl
		return Promise.all([
			_getPnlStats(updatedPredictions, date),
			_getPnlStats(updatedPredictions, date, true)
		])
		.then(([pnlStatsPortfolio, pnlStatsByTicker]) => {
			return {
				portfolio: pnlStatsPortfolio,
				byTickers: pnlStatsByTicker
			};
		});
	})
};

function _computeTotalPnlStatsForAll(advisorId, date) {
	return Promise.all([
		_computeTotalPnlStats(advisorId, date, {category: "started"}),
		_computeTotalPnlStats(advisorId, date, {category: "all"}),
		_computeTotalPnlStats(advisorId, date, {category: "ended"})
	])
	.then(([startedPredictionsTotalPnl, allPredictionsTotalPnl, endedPredictionsTotalPnl]) => {
		return {
			started: startedPredictionsTotalPnl,
			all: allPredictionsTotalPnl,
			ended: endedPredictionsTotalPnl
		};
	});
}

function _computeDailyPnlStats(advisorId, date, options) {

	const category = _.get(options, 'category', "all");
	
	let yesterday = moment(date).subtract(1, 'days').toDate();

	return exports.getPredictionsForDate(advisorId, date, {category})
	.then(updatedPredictions => {
			
		//BUT THE updated predictions have Call price as of beginning of prediction
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

			var updatedPredictions = updatedPredictionWithYesterdayCallPrice.map(item => {
				var success = _.get(item, 'status.profitTarget', false) && moment(date).isSame(moment(item.status.date));
				var failure = _.get(item, 'status.stopLoss', false) && moment(date).isSame(moment(item.status.date));
				var manualExit = _.get(item, 'status.manualExit', false) && moment(date).isSame(moment(item.status.date));

				if(success) {
					item.position.lastPrice = item.target;
				} else if(failure) {

					var stopLossDirection = item.position.investment > 0 ? -1 : 1;
					var stopLoss = Math.abs(_.get(item, 'stopLoss', 1));

					var stopLossPrice = (1+stopLossDirection*stopLoss)*item.position.avgPrice;
					item.position.lastPrice = stopLossPrice;
				} 

				return  item;
			});

			//Total Pnl
			return _getPnlStats(updatedPredictions);
		});
	});	
};

function _computeDailyPnlStatsForAll(advisorId, date) {
	return Promise.all([
		_computeDailyPnlStats(advisorId, date, {category: "started"}),
		_computeDailyPnlStats(advisorId, date, {category: "all"}),
		_computeDailyPnlStats(advisorId, date, {category: "ended"})
	])
	.then(([startedPredictionsDailyPnl, allPredictionsDailyPnl, endedPredictionsDailyPnl]) => {
		return {
			started: startedPredictionsDailyPnl,
			all: allPredictionsDailyPnl,
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
		var latestTotalPnlStats = _.get(latestPnlStats, 'detail.cumulative.all', {});
		var latestRealizedPnlStats = _.get(latestPnlStats, 'detail.cumulative.ended', {});
		var lastRealizedPnlStats = _.get(yesterdayPnlStats, 'net.realized', {});
		
		return Promise.all([
			_aggregatePnlStats([lastRealizedPnlStats.portfolio, latestTotalPnlStats.portfolio]),
		    _aggregatePnlStatsByTickers([lastRealizedPnlStats.byTickers, latestTotalPnlStats.byTickers]),
		    _aggregatePnlStats([lastRealizedPnlStats.portfolio, latestRealizedPnlStats.portfolio]),
		    _aggregatePnlStatsByTickers([lastRealizedPnlStats.byTickers, latestRealizedPnlStats.byTickers])
		])
		.then(([pnlStatsTotalPortfolio, pnlStatsTotalByTicker, pnlStatsRealizedPortfolio, pnlStatsRealizedByTicker]) => {
			return {
				realized: {portfolio: pnlStatsRealizedPortfolio, byTickers: pnlStatsRealizedByTicker},
				total: {
					portfolio: pnlStatsTotalPortfolio, 
					byTickers: pnlStatsTotalByTicker
				}
			};
		});
	});
}

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

module.exports.getTotalPnlStats = function(advisorId, date, category="all") {
	return DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date)
	.then(pnlStats => {
		if (pnlStats) {
			switch(category) {
				//HOW TO ADD CHECK FOR KEYS
				case "all" : return _.get(pnlStats,'detail.cumulative.all', null); break;
				case "ended" : return _.get(pnlStats, 'detail.cumulative.ended', null); break;
				case "started" : return _.get(pnlStats, 'detail.cumulative.started', null); break;
			}
		} else {
			return _computeTotalPnlStats(advisorId, date, category);
		}
	});	
};

module.exports.getDailyPnlStats = function(advisorId, date, category="all") {
	return DailyContestEntryPerformanceModel.fetchPnlStatsForDate({advisor: advisorId}, date)
	.then(pnlStats => {
		if (pnlStats) {
			switch(category) {
				case "all" : return _.get(pnlStats, 'detail.daily.all', null); break;
				case "ended" : return _.get(pnlStats, 'detail.daily.ended', null); break;
				case "started" : return _.get(pnlStats, 'detail.daily.started', null); break;
			}
		} else {
			return _computeDailyPnlStats(advisorId, date, category);
		}
	});
};

module.exports.getPnlStatsForDate = function(advisorId, date, category="all") {
	
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	return Promise.all([
		exports.getDailyPnlStats(advisorId, date, category),
		exports.getTotalPnlStats(advisorId, date, category)
	])
	.then(([dailyPnl, totalPnl]) => {
		return {daily: dailyPnl, cumulative: totalPnl};
	});
};

module.exports.getPortfolioStatsForDate = function(advisorId, date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	return DailyContestEntryPerformanceModel.fetchPortfolioStatsForDate({advisor: advisorId}, date);
};

module.exports.getPredictionsForDate = function(advisorId, date, options) {
	
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	const category = _.get(options, 'category', "started");
	const priceUpdate = _.get(options, 'priceUpdate', true);

	let updatedPredictions;
	return Promise.resolve()
	.then(() => {

		//How to compute all predictions today [All = active ]
		//Can there by any duplication in combining the ended and active - YES
		//Because active is a super set of ending that day and ending after the day
		//**** IF used before market close *****
		var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;
		var useEndedPredictions = !isToday || (isToday && moment().isAfter(moment(DateHelper.getMarketCloseDateTime(date))));
		
		switch(category) {
			case "all": return DailyContestEntryModel.fetchEntryPredictionsOnDate({advisor: advisorId}, date); break;
			case "started": return DailyContestEntryModel.fetchEntryPredictionsStartedOnDate({advisor: advisorId}, date); break;
			case "ended": return DailyContestEntryModel.fetchEntryPredictionsEndedOnDate({advisor: advisorId}, date); break;
			
			// //not used 
			// case "all": return Promise.all([
			// 				useEndedPredictions ? DailyContestEntryModel.fetchEntryPredictionsEndedOnDate({advisor: advisorId}, date) : [],
			// 				DailyContestEntryModel.fetchEntryPredictionsActiveOnDate({advisor: advisorId}, date) 
			// 			])
			// 			.then(([endedPredictions, activePredictions]) => {
			// 				return endedPredictions.concat(activePredictions);
			// 			});
		}
	})
	.then(predictions => {
		if (predictions && predictions.length > 0){
			return priceUpdate ? _computeUpdatedPredictions(predictions, date) : predictions;
		} else {
			return [];
		}
	})
	.then(updatedPredictionsWithLastPrice => {

		//Update security latest detail
		if (priceUpdate) {
			return Promise.map(updatedPredictionsWithLastPrice, function(prediction) {
				return SecurityHelper.getStockDetail(prediction.position.security, date)
				.then(securityDetail => {
					var updatedPosition = Object.assign(prediction.position, {security: securityDetail});
					return Object.assign(prediction, {position: updatedPosition});
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
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {
			return exports.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false})
			.then(activePredictions => {
				if (activePredictions.length > 0) {
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
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {
			return exports.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false})
			.then(activePredictions => {
				if (activePredictions.length > 0) {
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


/**
 * Update the portfolio stats for advisorId
 */
module.exports.updateLatestPortfolioStatsForAdvisor = function(advisorId, date){
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	
	return Promise.all([
		exports.getPredictionsForDate(advisorId, date, {category: "all"}),
		exports.getPredictionsForDate(advisorId, date, {category: "started", priceUpdate:false}),
		exports.getPredictionsForDate(advisorId, date, {category: "ended", priceUpdate: false}),
		AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: 'account'})
	])
	.then(([allPredictions, startedPredictions, endedPredictions, advisor]) => {
		
		return new Promise(resolve => {
			//Now some of the active predictions may have ended as well.		
			var netEquity = 0.0;
			var grossEquity = 0.0;
			var cash = _.get(advisor, 'account.cash', 0.0);	
			
			var endedPredictionIds = endedPredictions.map(item => item._id.toString());

			allPredictions.forEach(item => {

				//Filter out the ended predicition to compute equity/investment
				if (endedPredictions.indexOf(item._id.toString()) == -1) {
					var investment = _.get(item, 'position.investment', 0);
					var lastPrice = _.get(item, 'position.lastPrice', 0);
					var avgPrice = _.get(item, 'position.avgPrice', 0);

					var equity = (avgPrice > 0 ? investment * (lastPrice/avgPrice) : investment)*1000;
					netEquity += equity
					grossEquity += Math.abs(equity);
				}

			});

			Promise.map(endedPredictions, function(item) {
				var manualExit = _.get(item, 'status.manualExit', false);
				var lastPrice = _.get(item, 'position.lastPrice', 0);
				var investment = _.get(item, 'position.investment', 0);
				var avgPrice = _.get(item, 'position.avgPrice', 0);

				//Manual Exit will update cash (if lastPrice is not yet populated)
				if (manualExit && lastPrice == 0.0) {
					//Get the latest price to compute tentative cash procees
					//This adjust just the 
					return SecurityHelper.getStockLatestDetail(item.position.security)
					.then(securityDetail => {
						lastPrice = _.get(securityDetail, 'latestDetailRT.current', 0) || 
							_.get(securityDetail, 'latestDetailRT.close') || 
							_.get(securityDetail, 'latestDetail.Close', 0);

						var cashGenerated = avgPrice > 0 ? (lastPrice/avgPrice)*investment : investment;
						
						cash += cashGenerated;
					});
				} 
	
			})
			.then(() => {

				var grossTotal = grossEquity + cash;
				var netTotal = netEquity + cash;
				
				var advisorAccount = advisor ? _.get(advisor.toObject(), 'account', {}) : {};
				
				const updates = {
					...advisorAccount, cash,
					netEquity, grossEquity, grossTotal, netTotal, 
					numPredictions: allPredictions.length,
					numStartedPredictions: startedPredictions.length,
					numEndedPredictions: endedPredictions.length
				};
		
				resolve(DailyContestEntryPerformanceModel.updatePortfolioStatsForDate({advisor: advisorId}, updates, date));
			})
		})
	})
};

/**
 * Update the portoflio stats for all entries
 */
module.exports.updateAllEntriesLatestPortfolioStats = function(date){
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {
			return exports.updateLatestPortfolioStatsForAdvisor(advisorId, date);
		});
	});
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

//Get all active predicitions, combine thenm get price per ticker and compare the price
//and filter ot the successful ones

//Handles only predictions ending today
module.exports.checkForPredictionTarget = function(category = "all") {
	const currentDate = DateHelper.getMarketCloseDateTime(DateHelper.getCurrentDate());

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {
			return exports.getPredictionsForDate(advisorId, currentDate, {category, priceUpdate:false})
			.then(predictions => {
				
				return predictions
					.filter(item =>  {
						var targetStatus = _.get(item, 'status.profitTarget', false);
						var stopLossStatus = _.get(item, 'status.stopLoss', false);
						var manualExitStatus = _.get(item, 'status.manualExit', false);

						return !targetStatus && !stopLossStatus && !manualExitStatus})
					.map(item => {
						return {...item, advisorId: advisorId};
				});

			});

		})
		.then(allPredictionsByAdvisorIds => {
			//this is an array of array of predicitions
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
						var highPrice = _.get(securityDetail,'latestDetail.high', -Infinity);
						var lowPrice = _.get(securityDetail, 'latestDetail.low', Infinity);
						var rtPriceDate = DateHelper.getDate(_.get(securityDetail, 'latestDetail.date', null));
						
						//At the beginning of the day, the latest RT may not be available
						//And above call may return yesterday's RT data.
						//Therefore, before making target check, make sure that the
						//price belongs to the current date
						var isPriceDataForToday = DateHelper.compareDates(DateHelper.getCurrentDate(), rtPriceDate) == 0;

						var successfulPredictions = isPriceDataForToday ? allPredictionsByTicker.filter(item => {
							var investment = item.position.investment;							
							var target = item.target;

							var success = (investment > 0 && highPrice > target) || (investment < 0 && lowPrice < target);
							 
							if (success) {
						 		item.status.price = investment > 0 ? highPrice : lowPrice;
						 		item.status.profitTarget = true;
						 		item.status.stopLoss = false;
						 		item.status.date = DateHelper.getMarketCloseDateTime(new Date());
						 		item.status.trueDate = new Date();
						 	}

						 	var lossDirection = -1 * (investment > 0 ? 1 : -1);
							var stopLossPrice = (1 + lossDirection*Math.abs(_.get(item, 'stopLoss', 1))) * item.position.avgPrice;
						 	var stopLossFailure = stopLossPrice != 0 && ((investment > 0 && lowPrice < stopLossPrice) || (investment < 0 && highPrice > stopLossPrice));	

						 	if (stopLossFailure) {
						 		item.status.price = investment > 0 ? lowPrice : highPrice;
						 		item.status.stopLoss = true;
						 		item.status.profitTarget = false;
						 		item.status.date = DateHelper.getMarketCloseDateTime(new Date());
						 		item.status.trueDate = new Date();
						 	}

						 	return success || stopLossFailure;

						}) : [];

						//SHORTCUT
						//FIRST check which predictions are successful on daily high/low basis
						
						if (successfulPredictions.length > 0) {

							var successfulDayBasis = successfulPredictions.filter(item => {
								var isStartDateToday = DateHelper.compareDates(item.startDate, currentDate) == 0;
								
								//Make sure only one direction is hit with daily price movement
								//If both directions are hit, we need to time resolve (which was hit first?) [at next step]
								var oneOfStopLossAndProfitTarget = !(item.status.profitTarget && item.status.stopLoss);
								return !isStartDateToday && oneOfStopLossAndProfitTarget
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

										var highPrice = _.get(extremePricesSinceStartDate, 'high.price', -Infinity);
										var highPriceDateTime = _.get(extremePricesSinceStartDate, 'high.datetime', null);
										var lowPrice = _.get(extremePricesSinceStartDate, 'low.price', Infinity);
										var lowPriceDateTime = _.get(extremePricesSinceStartDate, 'low.datetime', null);

										var success = (investment > 0 && highPrice > target) || (investment < 0 && lowPrice < target);
										var successDateTime = success && investment > 0 ? highPriceDateTime : lowPriceDateTime;

										var lossDirection = -1 * (investment > 0 ? 1 : -1);
										var stopLossPrice = (1 + lossDirection*Math.abs(_.get(item, 'stopLoss', 1))) * item.position.avgPrice
									 	var stopLossFailure = stopLossPrice != 0 && ((investment > 0 && lowPrice < stopLossPrice) || (investment < 0 && highPrice > stopLossPrice));	
									 	var stopLossFailureDateTime = stopLossFailure && investment > 0 ? lowPriceDateTime : highPriceDateTime;

									 	//If both are true, find which one hit first ****
									 	if (success && stopLossFailure) {
								 			if (moment(successDateTime).isBefore(moment(stopLossFailureDateTime))) {
								 				stopLossFailure = false;
									 		} else {
									 			success = false;
									 		}
									 	}	

									 	if (success) {
									 		item.status.price = investment > 0 ? highPrice : lowPrice;
									 		item.status.profitTarget = true;
									 		item.status.stopLoss = false;
									 		item.status.date = DateHelper.getMarketCloseDateTime(new Date());
									 		item.status.trueDate = successDateTime;
									 	}
									 	else if (stopLossFailure) {
									 		item.status.price = investment > 0 ? lowPrice : highPrice;
									 		item.status.stopLoss = true;
									 		item.status.profitTarget = false;
									 		item.status.date = DateHelper.getMarketCloseDateTime(new Date());
									 		item.status.trueDate = stopLossFailureDateTime;
									 	}

									 	return success || stopLossFailure;

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

					return Promise.all([
						exports.updateAdvisorAccountCredit(prediction.advisorId, prediction),
						DailyContestEntryModel.updatePrediction({advisor: prediction.advisorId}, prediction)
					]);
				});
			})
			.then(() => {
				return exports.updateAllEntriesLatestPortfolioStats();
			})
		});
	})
};

module.exports.addPredictions = function(advisorId, predictions, date) {
	return DailyContestEntryModel.addEntryPredictions({advisor: advisorId, date: date}, predictions, {new:true, upsert: true, fields:'_id'})
	.then(added => {
		//Updating advisor account with new metrics
		return AdvisorHelper.updateAdvisorAccountDebit(advisorId, predictions);
	})
	.then(updatedAdvisor => {
		return exports.updateLatestPortfolioStatsForAdvisor(advisorId);

	})
};

module.exports.updateCallPriceForPredictions = function() {
	const currentDate = DateHelper.getMarketCloseDateTime(DateHelper.getCurrentDate());

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => {
		return Promise.mapSeries(advisors, function(advisorId) {

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
			const nSymbol = symbol.toUpperCase();
			return DailyContestEntryPerformanceModel.fetchLatestPnlStatsForSymbol({advisor: advisorId}, nSymbol);
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
					output[key] = {
						..._.get(netPnlStats, `${key}.all`, {}),
						tickers: Object.keys(_.get(netPnlStats, `${key}.byTickers`, {}))
					};
				});

				return output;
			}
		} else {
			APIError.throwJsonError({msg: "No Pnl Stats"});
		}
	})
};

function _getDistinctPredictionTickersForAdvisors(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	
	var advisorsByTicker = {};
	
	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(distinctAdvisors => {
		return Promise.mapSeries(distinctAdvisors, function(advisorId){
			return exports.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false})
			.then(predictions => {
				var predictionTickers = predictions.map(item => {return _.get(item, 'position.security.ticker', null)}).filter(item => item) || [];
				return Promise.map(predictionTickers, function(ticker) {
					if (ticker in advisorsByTicker) {
						advisorsByTicker[ticker].push(advisorId) 
					} else {
						advisorsByTicker[ticker] = [advisorId];
					}
					return;
				})
			})
		})
	})
	.then(() => {
		return advisorsByTicker;
	});	
}

//function to update the interval prices
module.exports.updatePredictionsForIntervalPrice = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);
	
	//can be simplified to tickers * (advisor-predictons)
	return _getDistinctPredictionTickersForAdvisors(date)
	.then(allAdvisorsByTickers => {
		var allTickers = Object.keys(allAdvisorsByTickers);

		return Promise.mapSeries(allTickers, function(ticker) {
			return SecurityHelper.getStockIntradayHistory({ticker: ticker}, date)
			.then(securityDetail => {
				var advisorsForThisTicker = _.uniq(allAdvisorsByTickers[ticker]);

				return Promise.mapSeries(advisorsForThisTicker, function(advisorId){
					return exports.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false})
					.then(predictions => {
						return Promise.mapSeries(predictions, function(prediction){
							var pTicker = _.get(prediction, 'position.security.ticker', "");
							if (pTicker == ticker) {
								var currentHighPrice = _.get(prediction, 'priceInterval.highPrice', -Infinity);
								var currentLowPrice = _.get(prediction, 'priceInterval.lowPrice', Infinity);

								var possibleEndDate = prediction.status.trueDate || prediction.status.date || prediction.endDate;
								var extremePricesSinceStartDate = _getExtremePrices(securityDetail.intradayHistory, prediction.startDate, possibleEndDate);
								var highPrice = _.get(extremePricesSinceStartDate, 'high.price', -Infinity);
								var lowPrice = _.get(extremePricesSinceStartDate, 'low.price', Infinity);
								
								lowPrice = Math.min(lowPrice, currentLowPrice);
								highPrice = Math.max(highPrice, currentHighPrice);

								prediction.priceInterval = {lowPrice, highPrice};
								
								return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction);
								
							} else {
								return;
							}
						})
					})
				})
			})
		
		})
	})
}

//Function to update the last price for manually exited positions 
module.exports.updateManuallyExitedPredictionsForLastPrice = function(date) {
	date = DateHelper.getMarketCloseDateTime(!date ? DateHelper.getCurrentDate() : date);

	return _getDistinctPredictionTickersForAdvisors(date)
	.then(allAdvisors => {
		return Promise.mapSeries(allAdvisors, function(advisorId){
			return exports.getPredictionsForDate(advisorId, date, {category: "ended", priceUpdate: false})
			.then(predictions => {
				return Promise.mapSeries(predictions, function(prediction){
					var ticker = _.get(prediction, 'position.security.ticker', "");
					var trueEndDateTime = _.get(prediction, 'status.trueDate', null);
					var manualExit = _.get(prediction, 'status.manualExit', false);
					
					if (manualExit && trueEndDateTime) {
						return SecurityHelper.getStockIntradayHistory({ticker: ticker}, trueEndDateTime)
						.then(securityDetail => {
							var intradayHistory = _.et(securityDetail, 'intradayHistory', []);

							var relevantIntradayHistory = intradayHistory.filter(item => {return !moment(item.datetime).isBefore(moment(trueEndDateTime))});

							if (relevantIntradayHistory.length > 0) {
								var price = relevantIntradayHistory[0].close || 0;
								prediction.position.lastPrice = price;

								//Updating advisor account 
								return Promise.all([
									AdvisorHelper.updateAdvisorAccountCredit(advisorId, prediction),
									DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction)
								]);
							} else {
								return;
							}
						});

					} else {
						return;
					}
					
				})
			})
		})
		.then(() => {
			return exports.updateAllEntriesLatestPortfolioStats();
		})
	})
}

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
            return exports.updatePredictionsForIntervalPrice(date) 
            .then(() => {
                return exports.updateAllEntriesLatestPnlStats(date);
            })
            .then(() => {
                return exports.updateAllEntriesNetPnlStats(date);                       
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
				return exports.getPredictionsForDate(advisorId, date, {priceUpdate: false})
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
	return exports.getPredictionsForDate(advisorId, DateHelper.getCurrentDate(), {category:'all', priceUpdate: false})
	.then(activePredictions => {
		
		let totalInvestment = 0;
		let cashUsed = 0;
		activePredictions.forEach(item => {
			var investment = item.position.investment * 1000;
			totalInvestment += Math.abs(investment);
			cashUsed += investment;
		});
		
		if (totalInvestment <= 1000000) {
			const newAccount = {
				investment: totalInvestment,
				liquidCash: Math.max(1000000 - totalInvestment, 0),
				cash: Math.max(1000000 - cashUsed, 0),
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

					return exports.getPredictionsForDate(advisorId, DateHelper.getCurrentDate(), {category:'all', priceUpdate: false})
					.then(activePredictions => {
						let totalInvestment = 0;
						let cashUsed = 0;
						activePredictions.forEach(item => {
							var investment = item.position.investment * 1000;
							totalInvestment += Math.abs(investment);
							cashUsed -= investment;
						});
						
						if (totalInvestment > 1000000) {
							return Promise.map(activePredictions, function(prediction) {
								prediction.position.investment = (prediction.position.investment/totalInvestment)*700000;
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


