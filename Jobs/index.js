/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-01 13:40:27
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

	// schedule.scheduleJob("30 22 * * *", function() {
	//     PortfolioHelper.updateAllPortfoliosForSplitsAndDividends();
	// });

	// schedule.scheduleJob("30 13 * * 1-5", function() {
	// 	if (config.get('send_performance_digest')) {
	//     	ContestHelper.sendContestEntryDailyDigest();
 //    	}
	// });

	schedule.scheduleJob("30 12 * * 1-5", function() { 
        DailyContestEntryHelper.updateAllEntriesPnlStats()
        .then(() => {
        	DailyContestStatsHelper.updateContestStats();
        });
	});

	schedule.scheduleJob("*/15 6-12 * * 1-5", function() { 
    	DailyContestStatsHelper.updateContestTopStocks()
	});

	schedule.scheduleJob("*/30 6-12 * * 1-5", function() { 
    	DailyContestEntryHelper.checkForPredictionTarget();
	});

	const scheduleString = `*/5 * ${DateHelper.getMarketOpenHour() - 1}-${DateHelper.getMarketCloseHour() + 1} * 1-5`;

	//Run every 5th minute
	schedule.scheduleJob(scheduleString, function() { 
	    DailyContestEntryHelper.updateCallPriceForPredictions();
	});


}