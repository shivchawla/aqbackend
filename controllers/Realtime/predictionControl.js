/*
* @Author: Shiv Chawla
* @Date:   2018-11-02 12:58:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-06 09:35:57
*/
'use strict';
const config = require('config');
const schedule = require('node-schedule');
const Promise = require('bluebird');
const WebSocket = require('ws');

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
		APIError.throwJsonError({message: "Websocket is not OPEN"});
	}
}

function _sendPredictionUpdates(subscription) {
	
	let entryId;
	let category;

	return Promise.resolve()
	.then(() => {
		category = subscription.category;
		entryId = subscription.entryId;
		
		var date = DateHelper.getCurrentDate();

		if (entryId) {
			return Promise.all([
				DailyContestEntryHelper.getPredictionsForDate(entryId, date, category),
				DailyContestEntryHelper.getPnlForDate(entryId, date, category)
			]);
		} else {
			console.log("Contest Entry Invalid");
			return; 
		}	
		
	})
	.then(([predictions, pnl]) => {
		return _sendWSResponse(subscription.response, {entryId, category, predictions, pnl});
	})
}

function _sendAllPredictionUpdates() {
	var subscribers = Object.keys(predictionSubscribers);
	
	return Promise.mapSeries(subscribers, function(subscriberId) {
		var subscription = predictionSubscribers[subscriberId];
		return _sendPredictionUpdates(subscription);
	});
}

function _handlePredictionSubscription(req, res) {
	return new Promise(resolve => {
		const userId = req.userId;
		const category = req.category;

		return DailyContestEntryHelper.getContestEntryForUser(userId)
		.then(contestEntry => {
			if (contestEntry) {

				var subscription = predictionSubscribers[userId];
				let contestEntryId = contestEntry._id;

				if (subscription) {
					predictionSubscribers[userId].response = res;
					predictionSubscribers[userId].category = category;
					predictionSubscribers[userId].entryId = contestEntryId;
				} else {
					predictionSubscribers[userId] = {response: res, category, entryId: contestEntryId};
				}

				//Send immediate response back to subscriber
				resolve(_sendPredictionUpdates(predictionSubscribers[userId]));
			
			} else {
				APIError.throwJsonError({msg: "No contest entry found. WS request can't be completed"});
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
