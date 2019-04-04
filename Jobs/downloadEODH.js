/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 19:09:29
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-04 09:59:57
*/

'use strict';
const schedule = require('node-schedule');
const config = require('config');
const moment = require('moment-timezone');
const path = require('path');
const Promise = require('bluebird');
const _ = require('lodash');
const redis = require('redis');

const DateHelper = require('../utils/Date');
const serverPort = require('../index').serverPort;

const DailyContestEntryHelper = require('../controllers/helpers/DailyContestEntry');
const DailyContestEntryModel = require('../models/Marketplace/DailyContestEntry');
const PredictionRealtimeController = require('../controllers/Realtime/predictionControl');
const MktPlaceController = require('../controllers/Realtime/mktPlaceControl');
const SecurityHelper = require('../controllers/helpers/Security');
const RedisUtils = require('../utils/RedisUtils');

var redisClient;

function getRedisClient() {
	if (!redisClient || !redisClient.connected) {
		var redisPwd = config.get('node_redis_pass');

		if (redisPwd != "") {
        	redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: redisPwd});
    	} else {
    		redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'));
    	}
    }

    return redisClient; 
}

//Fucntion to fetch latest quote data from EODH for active predictions
function downnloadEODHRealtimeForActivePredictions() {

	const currentDate = DateHelper.getMarketCloseDateTime(DateHelper.getCurrentDate());

	return DailyContestEntryModel.fetchDistinctAdvisors()
	.then(advisors => { 
		return Promise.mapSeries(advisors, function(advisorId) {
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, currentDate, {category: "all", priceUpdate:false, active: null})
			.then(predictions => {
				return predictions.map(item => {
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

		return Promise.map(Array(numBatches), function(index, batch) {
			return SecurityHelper.updateRealtimeQuotesFromEODH(uniqueTickers.slice(index*batchSize, (index+1)*batchSize));
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
	
	const scheduleUpdateCallPriceEODH = `20 */1 ${DateHelper.getMarketOpenHourLocal()}-${DateHelper.getMarketCloseHourLocal()} * * 1-5`;
	schedule.scheduleJob(scheduleUpdateCallPriceEODH, function() { 
		if (!DateHelper.isHoliday() && DateHelper.isMarketTrading(0, -5)) {
			Promise.resolve()
			.then(() => {
				if (DateHelper.isMarketTrading(0, -1)) {
					Promise.all([
						SecurityHelper.updateIndexRealtimeQuotesFromNifty(),
						downnloadEODHRealtimeForActivePredictions()
					])
					.then(() => {
			    		DailyContestEntryHelper.updateCallPriceForPredictionsFromEODH()
		    		})
			    	.then(() => {
			    		RedisUtils.publish(getRedisClient(), `sendRealtimeUpdates_${process.env.NODE_ENV}`, 1)
					})
					.catch(err => {
						console.log("scheduleUpdateCallPriceEODH: ", err.message);
					})
		    	}
	    	})
    	}
	});
	
}  	
