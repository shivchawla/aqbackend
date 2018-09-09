/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-09 17:59:14
*/

'use strict';
const PortfolioHelper = require('../controllers/helpers/Portfolio');
const AnalyticsHelper = require('../controllers/helpers/Analytics');
const SecurityHelper = require('../controllers/helpers/Security');
const ContestHelper = require('../controllers/helpers/Contest');
const DailyContestHelper = require('../controllers/helpers/DailyContest');

const schedule = require('node-schedule');
const config = require('config');
const serverPort = require('../index').serverPort;

//SecurityHelper.updateStockList();

if (config.get('jobsPort') === serverPort) {
	//Run every 5th minute
	schedule.scheduleJob("*/50 * * * 1-5", function() { 
        AnalyticsHelper.updateAllAnalytics()
        .then(() => {
            ContestHelper.updateAllAnalytics();
        })
	});

	schedule.scheduleJob("0 23 * * *", function() {
	    SecurityHelper.updateStockList();
	});

	schedule.scheduleJob("30 22 * * *", function() {
	    PortfolioHelper.updateAllPortfoliosForSplitsAndDividends();
	});

	schedule.scheduleJob("30 13 * * 1-5", function() {
		if (config.get('send_performance_digest')) {
	    	ContestHelper.sendContestEntryDailyDigest();
    	}
	});

	schedule.scheduleJob("*/50 * * * 1-5", function() { 
        DailyContestHelper.updateAllEntriesPnlStats();
	});

	schedule.scheduleJob("0 14 * * * 1-5", function() { 
        DailyContestHelper.updateDailyContestWinners();
	});

}