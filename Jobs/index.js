/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-22 19:47:57
*/

'use strict';
const PortfolioHelper = require('../controllers/helpers/Portfolio');
const AnalyticsHelper = require('../controllers/helpers/Analytics');
const SecurityHelper = require('../controllers/helpers/Security');
const ContestHelper = require('../controllers/helpers/Contest');
const DailyContestHelper = require('../controllers/helpers/DailyContest');
const DateHelper = require('../utils/Date');

const schedule = require('node-schedule');
const config = require('config');
const moment = require('moment-timezone');

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

	schedule.scheduleJob("*/20 5-12 * * 1-5", function() { 
        DailyContestHelper.updateAllEntriesPnlStats();
	});

	schedule.scheduleJob("*/50 5-12 * * 1-5", function() { 
        DailyContestHelper.updateAllEntriesPnlStats();
	});

	//Run every minute BUT complete execution at market Close ONLY
	schedule.scheduleJob("* * * * 1-5", function() { 
		var currentHour = moment().get('hour');
		var currentMinute = moment().get('minute');
		var offset = 30;
		if (currentHour == DateHelper.getMarketCloseHour() && currentMinute == DateHelper.getMarketCloseMinute() + offset) {
			return Promise.all([
				DailyContestHelper.updateAllEntriesPnlStats(),
				DailyContestHelper.updateDailyTopPicks(),
				DailyContestHelper.updateWeeklyTopPicks(),
			])
	        .then(() => {
	        	return DailyContestHelper.updateDailyContestWinners()
	    	})
	    	.then(() => {
	    		return DailyContestHelper.updateWeeklyContestWinners();
	    	})
    	}
	});

}