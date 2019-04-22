/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-05 20:53:43
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
const EODHJobs = require('./downloadEODH');
const DateHelper = require('../utils/Date');
const {sendJobCompletionEmail} = require('../email');

const schedule = require('node-schedule');
const config = require('config');
const moment = require('moment-timezone');

const serverPort = require('../index').serverPort;
const ibTickers = require('../documents/ibTickers.json');


var winnersUpdated = false;

if (config.get('jobsPort') === serverPort) {
	
	// schedule.scheduleJob("0 23 * * *", function() {
	// 	SecurityHelper.updateStockList()
	// 	.then(() => {
	// 		const message = {
	// 			subject: 'SUCCESS: UPDATED STOCK LIST',
	// 			text: 'SecurityHelper.updateStockList() successfully completed'
	// 		};
	// 		sendJobCompletionEmail(null, message);
	// 	})
	// 	.catch(err => {
	// 		const message = {
	// 			subject: 'ERROR: UPDATE STOCK LIST',
	// 			text: `SecurityHelper.updateStockList(), ${JSON.stringify(err.message)}`
	// 		};
	// 		sendJobCompletionEmail(null, message);
	// 	})
	// });
	// schedule.scheduleJob("0 23 * * *", function() {
	//     SecurityHelper.updateStockList();
	// });

	schedule.scheduleJob("30 18 * * *", function() {
		BacktestHelper.resetBacktestCounter()
		.then(() => {
			const message = {
				subject: 'SUCCESS: RESET BACKTEST COUNTER',
				text: 'BacktestHelper.resetBacktestCounter() successfully completed'
			};
			sendJobCompletionEmail(null, message);
		})
		.catch(err => {
			const message = {
				subject: 'ERROR: RESET BACKTEST COUNTER',
				text: `BacktestHelper.resetBacktestCounter(), ${JSON.stringify(err.message)}`
			};
			sendJobCompletionEmail(null, message);
		});
	});

	schedule.scheduleJob("30 22 * * *", function() {
		PortfolioHelper.updateAllPortfoliosForSplitsAndDividends()
		.then(() => {
			const message = {
				subject: 'SUCCESS: UPDATE ALL PORTFOLIOS FOR SPLITS AND DIVIDENDS',
				text: 'PortfolioHelper.updateAllPortfoliosForSplitsAndDividends() successfully completed'
			};
			sendJobCompletionEmail(null, message);
		})
		.catch(err => {
			const message = {
				subject: 'SUCCESS: UPDATE ALL PORTFOLIOS FOR SPLITS AND DIVIDENDS',
				text: `PortfolioHelper.updateAllPortfoliosForSplitsAndDividends(), ${JSON.stringify(err.message)}`
			};
			sendJobCompletionEmail(null, message);
		});
	});

	// schedule.scheduleJob("30 13 * * 1-5", function() {
	// 	if (config.get('send_performance_digest')) {
	//     	ContestHelper.sendContestEntryDailyDigest();
 //    	}
	// });

	const scheduleMarketOpenTime = `${DateHelper.getMarketOpenMinuteLocal()} ${DateHelper.getMarketOpenHourLocal()} * * 1-5`;
	schedule.scheduleJob(scheduleMarketOpenTime, function() { 
		winnersUpdated = false;
	});

	//Run the job sequence every 30 minutes from one hour before market open to one hour after market close
	const scheduleCheckPredictionTarget = `*/30 ${DateHelper.getMarketOpenHourLocal() - 1}-${DateHelper.getMarketCloseHourLocal() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleCheckPredictionTarget, function() {   	
    	
    	if (!DateHelper.isHoliday() && DateHelper.isMarketTrading(0, -40)) {

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
				const message = {
					subject: 'SUCCESS: SCHEDULE CHECK PREDICTION TARGET',
					message: 'scheduleCheckPredictionTarget, successfully completed'
				};
				sendJobCompletionEmail(null, message);
				DailyContestEntryHelper.checkAdvisorInvestmentSum();
			})
			.catch(err => {
				const message = {
					subject: 'ERROR: SCHEDULE CHECK PREDICTION TARGET',
					message: `scheduleCheckPredictionTarget, ${err.message}`
				};
				sendJobCompletionEmail(null, message);
				console.log(err.message);
			});
		}
	});

	const scheduleUpdateCallPrice = `*/5 ${DateHelper.getMarketOpenHourLocal() - 1}-${DateHelper.getMarketCloseHourLocal() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleUpdateCallPrice, function() { 
		if (!DateHelper.isHoliday() && DateHelper.isMarketTrading(0, -30)) {
	    	DailyContestEntryHelper.updateCallPriceForPredictions()
	    	.then(() => {
				const message = {
					subject: 'SUCCESS: SCHEDULE UPDATE CALL PRICE',
					message: 'scheduleUpdateCallPrice, successfully completed'
				};
				sendJobCompletionEmail(null, message);
	    		DailyContestEntryHelper.checkPredictionTriggers();
			})
			.catch(err => {
				const message = {
					subject: 'ERROR: SCHEDULE UPDATE CALL PRICE',
					message: `scheduleUpdateCallPrice, ${err.message}`
				};
				sendJobCompletionEmail(null, message);
			})
    	}
	});

	const scheduleUpdateCallPriceEODH = `20 */1 ${DateHelper.getMarketOpenHourLocal() - 1}-${DateHelper.getMarketCloseHourLocal() + 1} * * 1-5`;
	schedule.scheduleJob(scheduleUpdateCallPriceEODH, function() { 
		if (!DateHelper.isHoliday() && DateHelper.isMarketTrading(0, -1)) {
	    	DailyContestEntryHelper.updateCallPriceForPredictionsFromEODH()
	    	.then(() => {
				const message = {
					subject: 'SUCCESS: SCHEDULE UPDATE CALL PRICE EODH',
					message: 'scheduleUpdateCallPriceEODH, successfully completed'
				};
				sendJobCompletionEmail(null, message);
	    		DailyContestEntryHelper.checkPredictionTriggers();
			})
			.catch(err => {
				const message = {
					subject: 'ERROR: SCHEDULE UPDATE CALL PRICE EODH',
					message: `scheduleUpdateCallPriceEODH, ${err.message}`
				};
				sendJobCompletionEmail(null, message);
			})
    	}
	});
	

}


module.exports.writeContractDetailToFile = contractDetails => {
	console.log('Writing to contract-details.json');
	fs.writeFileSync('contract-details.json', JSON.stringify(contractDetails));
}
