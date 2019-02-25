/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-02-25 11:38:53
*/

'use strict';
const BacktestHelper = require('../controllers/helpers/Backtest');
const PortfolioHelper = require('../controllers/helpers/Portfolio');
const AnalyticsHelper = require('../controllers/helpers/Analytics');
const SecurityHelper = require('../controllers/helpers/Security');
const ContestHelper = require('../controllers/helpers/Contest');
const DailyContestStatsHelper = require('../controllers/helpers/DailyContestStats');
const DailyContestEntryHelper = require('../controllers/helpers/DailyContestEntry');
const AdhocJobs = require('../controllers/helpers/AdhocJobs');
const FormatJobs = require('../controllers/helpers/FormatDataJobs');
const DateHelper = require('../utils/Date');

const schedule = require('node-schedule');
const config = require('config');
const moment = require('moment-timezone');

const serverPort = require('../index').serverPort;

var winnersUpdated = false;

if (config.get('jobsPort') === serverPort) {
	
	schedule.scheduleJob("0 23 * * *", function() {
	    SecurityHelper.updateStockList();
	});

	schedule.scheduleJob("30 18 * * *", function() {
	    BacktestHelper.resetBacktestCounter()
	});

	schedule.scheduleJob("30 22 * * *", function() {
	    PortfolioHelper.updateAllPortfoliosForSplitsAndDividends();
	});

	// schedule.scheduleJob("30 13 * * 1-5", function() {
	// 	if (config.get('send_performance_digest')) {
	//     	ContestHelper.sendContestEntryDailyDigest();
 //    	}
	// });

	const scheduleMarketOpenTime = `${DateHelper.getMarketOpenMinute()} ${DateHelper.getMarketOpenHour()} * * 1-5`;
	schedule.scheduleJob(scheduleMarketOpenTime, function() { 
		winnersUpdated = false;
	});

	//Run the job sequence every 30 minutes from one hour before market open to one hour after market close
	const scheduleCheckPredictionTarget = `*/30 ${DateHelper.getMarketOpenHour() - 1}-${DateHelper.getMarketCloseHour() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleCheckPredictionTarget, function() {   	
    	
    	if (!DateHelper.isHoliday()) {

	    	DailyContestEntryHelper.checkForPredictionTarget()
	    	.then(() => {
	    		DailyContestEntryHelper.checkForPredictionExpiry();
	    	})
	    	.then(() => {
	    		DailyContestEntryHelper.updateManuallyExitedPredictionsForLastPrice();
	    	})
	    	.then(() => {
	    		DailyContestEntryHelper.updatePredictionsForIntervalPrice();
    		})
			.then(() => { 
	    		DailyContestEntryHelper.updateAllEntriesLatestPnlStats();
			})
	        .then(() => {
	        	DailyContestEntryHelper.updateAllEntriesNetPnlStats();
	    	})
	    	.then(() => {
	        	DailyContestEntryHelper.updateAllEntriesPerformanceStats();
	    	})
	    	.then(() => {
	    		DailyContestStatsHelper.updateContestTopStocks();
			})
			.then(() => {
				//If time after market close (+ 30 minutes), update the winners as well
				const marketCloseDateTimeOffset = DateHelper.getMarketCloseDateTime().add(30, 'minutes');
				if (moment().isAfter(marketCloseDateTimeOffset) && !winnersUpdated) { 
		        	DailyContestStatsHelper.updateContestStats()
		        	.then(() => {
		        		DailyContestStatsHelper.updateDailyContestOverallWinnersByEarnings(config.get('winner_csv_path'));
		        	})
		        	.then(() => {
		        		winnersUpdated = true;
		        	});
		        }
			})
			.then(() => {
				DailyContestEntryHelper.checkAdvisorInvestmentSum();
			})
			.catch(err => {
				console.log(err.message);
			});
		}
	});



	const scheduleUpdateCallPrice = `*/5 ${DateHelper.getMarketOpenHour() - 1}-${DateHelper.getMarketCloseHour() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleUpdateCallPrice, function() { 
		if (!DateHelper.isHoliday()) {
	    	DailyContestEntryHelper.updateCallPriceForPredictions()
	    	.then(() => {
	    		DailyContestEntryHelper.checkPredictionTriggers();
	    	})
    	}
	});

}


