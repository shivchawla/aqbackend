/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-05 16:27:30
*/

'use strict';
const PortfolioHelper = require('../controllers/helpers/Portfolio');
const AnalyticsHelper = require('../controllers/helpers/Analytics');
const SecurityHelper = require('../controllers/helpers/Security');
const ContestHelper = require('../controllers/helpers/Contest');
const DailyContestStatsHelper = require('../controllers/helpers/DailyContestStats');
const DailyContestEntryHelper = require('../controllers/helpers/DailyContestEntry');
const DateHelper = require('../utils/Date');

const schedule = require('node-schedule');
const config = require('config');
const moment = require('moment-timezone');

const serverPort = require('../index').serverPort;

//SecurityHelper.updateStockList();

if (config.get('jobsPort') === serverPort) {
	//Run every 5th minute
	// schedule.scheduleJob("*/50 * * * 1-5", function() { 
 //        AnalyticsHelper.updateAllAnalytics()
 //        .then(() => {
 //            ContestHelper.updateAllAnalytics();
 //        })
	// });

	schedule.scheduleJob("0 23 * * *", function() {
	    SecurityHelper.updateStockList();
	});

	schedule.scheduleJob("30 22 * * *", function() {
	    PortfolioHelper.updateAllPortfoliosForSplitsAndDividends();
	});

	// schedule.scheduleJob("30 13 * * 1-5", function() {
	// 	if (config.get('send_performance_digest')) {
	//     	ContestHelper.sendContestEntryDailyDigest();
 //    	}
	// });

	const marketCloseDateTimeOffset = DateHelper.getMarketCloseDateTime().add(30, 'minutes');
	const scheduleUpdatedEODStats = `${marketCloseDateTimeOffset.get('minute')} ${marketCloseDateTimeOffset.get('hour')} * * 1-5`;
	
	schedule.scheduleJob(scheduleUpdatedEODStats, function() { 
        DailyContestEntryHelper.updateAllEntriesPnlStats()
        .then(() => {
        	DailyContestStatsHelper.updateContestStats();
        });
	});

	const scheduleUpdateTopStocks = `*/30 ${DateHelper.getMarketOpenHour() - 1}-${DateHelper.getMarketCloseHour() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleUpdateTopStocks, function() { 
    	DailyContestStatsHelper.updateContestTopStocks()
	});

	const scheduleCheckPredictionTarget = `*/30 ${DateHelper.getMarketOpenHour() - 1}-${DateHelper.getMarketCloseHour() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleCheckPredictionTarget, function() { 
    	DailyContestEntryHelper.checkForPredictionTarget();
	});

	const scheduleUpdateCallPrice = `*/5 ${DateHelper.getMarketOpenHour() - 1}-${DateHelper.getMarketCloseHour() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleUpdateCallPrice, function() { 
	    DailyContestEntryHelper.updateCallPriceForPredictions();
	});
}