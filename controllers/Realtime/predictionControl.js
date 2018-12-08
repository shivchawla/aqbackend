/*
* @Author: Shiv Chawla
* @Date:   2018-11-02 12:58:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-08 10:21:28
*/
'use strict';
const config = require('config');
const schedule = require('node-schedule');
const Promise = require('bluebird');
const WebSocket = require('ws');

const AdvisorModel = require('../../models/Marketplace/Advisor');
const APIError = require('../../utils/error');

const DateHelper = require('../../utils/Date');
const DailyContestEntryHelper = require('../helpers/DailyContestEntry')

const predictionSubscribers = {};

/*
* Sends the data using WS connection
*/
function _sendWSResponse(res, data) {
	if (res && res.readyState === WebSocket.OPEN) {
		var msg = JSON.stringify(data)
		return res.send(msg);
	} else {
		throw new Error("Websocket is not OPEN");
	}
}

function _sendPredictionUpdates(subscription) {
	
	let advisorId;
	let category;

	return Promise.resolve()
	.then(() => {
		category = subscription.category;
		advisorId = subscription.advisorId;
		
		var date = DateHelper.getCurrentDate();

		if (advisorId) {
			return Promise.all([
				DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category}),
				DailyContestEntryHelper.getPnlForDate(advisorId, date, category)
			]);
		} else {
			console.log("WS: Advisor Invalid");
			return; 
		}	
		
	})
	.then(([predictions, pnl]) => {
		return _sendWSResponse(subscription.response, {advisorId, category, predictions, pnl});
	})
	.catch(err => {
		subscription.errorCount += 1;	
		console.log(err.message);
	})
}

function _sendAllPredictionUpdates() {
	var subscribers = Object.keys(predictionSubscribers);
	
	return Promise.mapSeries(subscribers, function(subscriberId) {
		var subscription = predictionSubscribers[subscriberId];
		if (subscription.errorCount > 5) {
			console.log("Deleting subscriber from list. WS connection is invalid for 5th attmept")
			delete predictionSubscribers[subscriberId];
			return;
		} else {
			return _sendPredictionUpdates(subscription);
		}
	});
}

function _handlePredictionSubscription(req, res) {
	return new Promise(resolve => {
		const userId = req.userId;
		const category = req.category;

		return AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'})
		.then(advisor => {
			if (advisor) {

				var subscription = predictionSubscribers[userId];
				let advisorId = advisor._id;

				if (subscription) {
					predictionSubscribers[userId].response = res;
					predictionSubscribers[userId].category = category;
					predictionSubscribers[userId].advisorId = advisorId;
					predictionSubscribers[userId].errorCount = 0;
				} else {
					predictionSubscribers[userId] = {response: res, category, advisorId: advisorId, errorCount: 0};
				}

				//Send immediate response back to subscriber
				resolve(_sendPredictionUpdates(predictionSubscribers[userId]));
			
			} else {
				APIError.throwJsonError({msg: "No advisor found. WS request can't be completed"});
			}

		});
		
	});
}

function _handlePredictionUnSubscription(req, res) {
	const userId = req.userId;
	const category = req.category;

	delete predictionSubscribers[userId];	
}


module.exports.sendAllUpdates = function() {
	return _sendAllPredictionUpdates();
};

//Function to subscribe WS data from backend to UI
module.exports.handlePredictionSubscription = function(req, res) {

	return _handlePredictionSubscription(req, res);
    
};


//Function to un-subscribe WS data from backend to UI
module.exports.handlePredictionUnSubscription = function(req, res) {
	return _handlePredictionUnSubscription(req, res);
    
};
