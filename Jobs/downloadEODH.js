/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 19:09:29
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-16 21:03:31
*/

'use strict';
const schedule = require('node-schedule');
const config = require('config');
const moment = require('moment-timezone');
const path = require('path');
const Promise = require('bluebird');

const DateHelper = require('../utils/Date');
const serverPort = require('../index').serverPort;

const DailyContestEntryHelper = require('../controllers/helpers/DailyContestEntry');
const DailyContestEntryModel = require('../models/Marketplace/DailyContestEntry');

const SecurityHelper = require('../controllers/helpers/Security');

//Fucntion to fetch latest quote data from EODH for active predictions
function downnloadEODHRealtimeForActivePredictions() {

	const currentDate = DateHelper.getMarketCloseDateTime(DateHelper.getCurrentDate());

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => { 
		return Promise.mapSeries(advisors, function(advisorId) {
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, currentDate, {category: "all", priceUpdate:false, active: null})
			.then(predictions => {
				return prediction.map(item => {
					return {...item, advisorId: advisorId};
				});
			});
		})
	})
	.then(allPredictionsByAdvisorIds => {
		//this is an array of array of predicitions
		//merge them
		var allPredictions = Array.prototype.concat.apply([], allPredictionsByAdvisorIds);
		var uniqueTickers = _.uniq(allPredictions.map(item => item.position.security.ticker));

		var batchSize = 10;
		var numBatches = Math.ceil(uniqueTickers.length / 10);

		return Promise.mapSeries(Array(numBatches), function(index, batch) {
			return SecurityHelper.getRealtimeQuotesFromEODH(uniqueTickers.slice(index*batchSize, (index+1)*batchSize));
		})		

	});
}

//Function to fetch latest quote data from EODH for NIFTY 500 constituents
function downloadEODHRealtimeForNifty500Stocks() {
			
	return SecurityHelper.getNifty500Constituents()
	.then(stockList => {

		var batchSize = 10;
		var numBatches = Math.ceil(stockList.length / 10);

		//Using map makes it much faster tha mapSeries (ofcourse) - but any shortcoming in this case?
		return Promise.map(Array(numBatches), function(batch, index) {
			return SecurityHelper.updateRealtimeQuotesFromEODH(stockList.slice(index*batchSize, (index+1)*batchSize));
		})

	})
}


if (config.get('jobsPort') === serverPort) {
	
	const startEODHDownloadTime = DateHelper.getMarketOpenDateTime()
	const endEODHDownloadTime = DateHelper.getMarketCloseDateTime()
	
	//10th sec of every 5 minutes for all weekdays (hours and minute are takend care by start and end time)
	const scheduleEODHDownloadRule = `10 */5 * * * 1-5`;
	schedule.scheduleJob(scheduleEODHDownloadRule, function() { 
		if (!DateHelper.isHoliday() && moment().isAfter(startEODHDownloadTime) && moment().isBefore(endEODHDownloadTime)) {
			downloadEODHRealtimeForNifty500Stocks();
		}
	});
}  	
