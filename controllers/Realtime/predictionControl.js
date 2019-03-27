/*
* @Author: Shiv Chawla
* @Date:   2018-11-02 12:58:24
* @Last Modified by:   Shiv Chawla
<<<<<<< Updated upstream
* @Last Modified time: 2019-03-27 12:25:37
=======
* @Last Modified time: 2019-03-27 12:15:24
>>>>>>> Stashed changes
*/
'use strict';
const config = require('config');
const schedule = require('node-schedule');
const Promise = require('bluebird');
const WebSocket = require('ws');
const _ = require('lodash');

const AdvisorModel = require('../../models/Marketplace/Advisor');
const UserModel = require('../../models/user');
const APIError = require('../../utils/error');

const DateHelper = require('../../utils/Date');
const DailyContestEntryHelper = require('../helpers/DailyContestEntry')
const BrokerRedisController = require('./brokerRedisControl');
const predictionSubscribers = {};

const marketOpenDateTimeHour = DateHelper.getMarketOpenDateTime().get('hour');
const marketCloseDateTimeHour = DateHelper.getMarketCloseDateTime().get('hour');
const scheduleUpdateUsingEODH = `${config.get(`20 * ${marketOpenDateTimeHour-1}-${marketCloseDateTimeHour+1} * * 1-5`;

schedule.scheduleJob(scheduleUpdateUsingEODH, function() {
	Promise.all([
		exports.sendAdminUpdates(),
		exports.sendAllUpdates()
	]);
});

/*
* Sends the data using WS connection
*/
function _sendWSResponse(res, data) {
	if (res && res.readyState === WebSocket.OPEN) {
		var msg = JSON.stringify(data)
		return res.send(msg);
	} else {
		return;
		//throw new Error("Websocket is not OPEN");
	}
}

function _sendPredictionUpdates(subscription) {
	
	let advisorId;
	let category;
	let masterAdvisorId = null;
	let real = false;

	return Promise.resolve()
	.then(() => {
		category = subscription.category;
		advisorId = subscription.advisorId;
		masterAdvisorId = subscription.masterAdvisorId;
		real = subscription.real
		
		var date = DateHelper.getCurrentDate();

		if (advisorId) {
			return Promise.all([
				DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category, active: null}),
				DailyContestEntryHelper.getPnlStatsForDate(advisorId, date, {category}),
				DailyContestEntryHelper.getPortfolioStatsForDate(advisorId, date)
			]);
		} else {
			APIError.throwJsonError({message: "WS: Advisor Invalid"});
		}	
			
	})
	.then(([predictions, pnlStats, portStats]) => {
		return _sendWSResponse(subscription.response, {advisorId: masterAdvisorId, real, category, predictions, pnlStats, portStats});
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


//ADMIN RELATED UPDATES.....
function _sendAdminUpdatesForAdvisor(userId, advisorId) {
	
	var subscription = predictionSubscribers[userId];
	if (subscription.errorCount > 5) {
		console.log("Deleting subscriber from list. WS connection is invalid for 5th attmept")
		delete predictionSubscribers[userId];
		return;
	} else {
		return _sendAdminRealPredictionUpdates(subscription, advisorId);
	}
}

function _getPredictionDetailForAdmin(advisorId, category, masterAdvisorId, predictionId) {
	
	var date = DateHelper.getCurrentDate();

	return Promise.resolve()
	.then(() => {
		if (predictionId) {
			return Promise.all([
				DailyContestEntryHelper.getPredictionById(advisorId, predictionId),
				BrokerRedisController.getPredictionStatus(masterAdvisorId, predictionId),
				BrokerRedisController.getPredictionActivity(masterAdvisorId, predictionId)
			])
			.then(([prediction, status, activity]) => {
				
				prediction.tradeActivity = prediction.tradeActivity.concat(_.get(activity, 'tradeActivity', []));
				prediction.orderActivity = prediction.orderActivity.concat(_.get(activity, 'orderActivity', []));

				return [{...prediction, current: status}];
			})
		} else {
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category, active: null})
			.then(predictions => {
				return Promise.map(predictions, function(prediction) {
					return Promise.all([
						BrokerRedisController.getPredictionStatus(masterAdvisorId, prediction._id),
						BrokerRedisController.getPredictionActivity(masterAdvisorId, prediction._id)
					])
					.then(([status, activity]) => {
						prediction.tradeActivity = prediction.tradeActivity.concat(_.get(activity, 'tradeActivity', []));
						prediction.orderActivity = prediction.orderActivity.concat(_.get(activity, 'orderActivity', []));

						return {...prediction, current: status};
					})
				});
			});
		}
	});	
}

//User Advisor map and sends updates for all real predictions (sends bulk per advice)
function _sendAdminRealPredictionUpdates(subscription, incomingAdvisorId, incomingPredictionId) {

	return Promise.resolve()
	.then(() => {
		let advisorMapList = subscription.advisorMapList;

		return Promise.map(advisorMapList, function(advisorMap) {

			let category = subscription.category;
			let advisorId = advisorMap.allocationAdvisor;
			let masterAdvisorId = advisorMap.masterAdvisor;

			//Send Advisor specific updates
			if (incomingAdvisorId && masterAdvisorId != incomingAdvisorId) {
				return;
			}

			return Promise.resolve()
			.then(() => {
				if (advisorId) {
					return Promise.all([
						//need to pass masterAdvisorId because Redis keys all data by masterAdvisorId
						_getPredictionDetailForAdmin(advisorId, category, masterAdvisorId, incomingPredictionId),						
						AdvisorModel.fetchAdvisor({_id: masterAdvisorId}, {fields: '_id user'})
					])
					.then(([predictions, masterAdvisor]) => {
						return predictions.map(item => {return {...item, advisor: _.pick(masterAdvisor, ['_id', 'user'])};})
					})
				} else {
					APIError.throwJsonError({message: "WS: Advisor Invalid"});
				}
			})
			.then(predictions => {
				return _sendWSResponse(subscription.response, {advisorId: masterAdvisorId, category, predictions});
			})

		})	
			
	})
	.catch(err => {
		subscription.errorCount += 1;	
		console.log(err.message);
	})
}

function _sendAllAdminRealPredictionsUpdates() {
	var subscribers = Object.keys(predictionSubscribers);
	
	return Promise.mapSeries(subscribers, function(subscriberId) {
		var subscription = predictionSubscribers[subscriberId];
		if (subscription.errorCount > 5) {
			console.log("Deleting subscriber from list. WS connection is invalid for 5th attmept")
			delete predictionSubscribers[subscriberId];
			return;
		} else {
			return _sendAdminRealPredictionUpdates(subscription);
		}
	});
}

/////////


//Handle simulated predictions (one advisor)
function _handlePredictionSubscription(req, res) {
	return new Promise((resolve, reject) => {
		const userId = req.userId;
		const advisorId = req.advisorId;
		const category = req.category;
		const real = _.get(req, 'real', false);

 		return UserModel.fetchUser({_id: userId}, {fields:'email'})
 		.then(user => {
 			const userEmail = _.get(user, 'email', null);
 			const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
			let advisorSelection = {user: userId, isMasterAdvisor: true};
			if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
				advisorSelection = {_id: advisorId};
			}
 			return AdvisorModel.fetchAdvisor(advisorSelection, {fields:'_id'});	
 		})
		.then(advisor => {
			if (advisor) {

				let advisorId = advisor._id;
				let masterAdvisorId = advisorId;

				if (real) {
					if (_.get(masterAdvisor, 'allocation.status', false)) {
						advisorId = masterAdvisor.allocation.advisor;
					} else {
						APIError.throwJsonError({message: "No real predictions found/possible for this advisor"});
					}
				}

				var subscription = predictionSubscribers[userId];
				
				if (subscription) {
					predictionSubscribers[userId].response = res;
					predictionSubscribers[userId].category = category;
					predictionSubscribers[userId].advisorId = advisorId;
					predictionSubscribers[userId].errorCount = 0;
					predictionSubscribers[userId].masterAdvisorId = masterAdvisorId;
					predictionSubscribers[userId].real = real;

				} else {
					predictionSubscribers[userId] = {response: res, category, advisorId, masterAdvisorId, real, errorCount: 0};
				}

				//Send immediate response back to subscriber
				return _sendPredictionUpdates(predictionSubscribers[userId]);
			
			} else {
				APIError.throwJsonError({message: "No advisor found. WS request can't be completed"});
			}

		})
		.then(prediction => {
			resolve(prediction);
		})
		.catch(err => {
			reject(err);
		})
		
	});
}

function _handlePredictionUnsubscription(req, res) {
	const userId = req.userId;
	delete predictionSubscribers[userId];	
}

//Handle real predictions (for admin -- handle multiple advisors)
function _handleRealPredictionUnsubscription(req, res) {
	const userId = req.userId;
	delete predictionSubscribers[userId];	
}

function _handleRealPredictionSubscription(req, res) {
	return new Promise((resolve, reject) => {
		const userId = req.userId;
		const advisorId = req.advisorId;
		const category = req.category;

 		return UserModel.fetchUser({_id: userId}, {fields:'email'})
 		.then(user => {
 			const userEmail = _.get(user, 'email', null);
 			const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
			
			if (isAdmin) {
				
				return AdvisorModel.fetchDistinctAdvisors({isMasterAdvisor: true, 'allocation.status':true})
				.then(masterAdvisorIds => {

					if (!advisorId) {
						return Promise.map(masterAdvisorIds, function(masterAdvisorId) {
							return AdvisorModel.fetchAdvisor({_id: masterAdvisorId}, {fields: '_id allocation user isMasterAdvisor'})
						})
					} else {
						return AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: '_id allocation user isMasterAdvisor'})
						.then(advisor => {
							return [advisor];
						})
					}
				})
			} else {
				APIError.throwJsonError({message: "Not authorized to subscribe all real predictions"});
			}
		})
		.then(masterAdvisors => {
			//Filter out nulls;
			masterAdvisors = masterAdvisors.filter(item => item).filter(item => item.isMasterAdvisor); 

			if (masterAdvisors && masterAdvisors.length > 0) {

				return Promise.map(masterAdvisors, function(masterAdvisor) {

					if (_.get(masterAdvisor, 'allocation.advisor', null) && _.get(masterAdvisor, 'allocation.status', false)) {
						return {masterAdvisor: masterAdvisor._id.toString(), allocationAdvisor: masterAdvisor.allocation.advisor.toString()}
					}
				})
				.then(advisorMapList => {
					//Filter out null
					advisorMapList = advisorMapList.filter(item => item);

					var subscription = predictionSubscribers[userId];
				
					if (subscription) {
						predictionSubscribers[userId].response = res;
						predictionSubscribers[userId].category = category;
						predictionSubscribers[userId].advisorMapList = advisorMapList
						predictionSubscribers[userId].errorCount = 0;

					} else {
						predictionSubscribers[userId] = {response: res, category, advisorMapList, errorCount: 0};
					}

					//Send immediate response back to subscriber
					return _sendAdminRealPredictionUpdates(predictionSubscribers[userId]);
				})
			} else {
				APIError.throwJsonError({message: "No allocation advisor found"})
			}

		})
		.then((predictionSubscribers) => {
			resolve(predictionSubscribers);
		})
		.catch(err => {
			reject(err);
		})
		
	});
}


module.exports.sendAllUpdates = function() {
	return _sendAllPredictionUpdates();
};

module.exports.sendAdminUpdates = function(advisorId, predictionId) {
	return UserModel.fetchUsers({email:{$in: config.get('admin_user')}}, {fields:'_id'})
	.then(adminUsers => {
		return Promise.map(adminUsers, function(adminUser) {
			var subcription = predictionSubscribers[adminUser._id.toString()];
			if (subcription) {
				return _sendAdminRealPredictionUpdates(subcription, advisorId, predictionId);	
			}
		})
	})
};


//Function to subscribe WS data from backend to UI
module.exports.handlePredictionSubscription = function(req, res) {
	return _handlePredictionSubscription(req, res);
};


//Function to un-subscribe WS data from backend to UI
module.exports.handlePredictionUnSubscription = function(req, res) {
	return _handlePredictionUnsubscription(req, res);
};


//Function to subscribe REAL predictions WS data from backend to UI
module.exports.handleRealPredictionSubscription = function(req, res) {
	return _handleRealPredictionSubscription(req, res);
};


//Function to un-subscribe WS data from backend to UI
module.exports.handleRealPredictionUnsubscription = function(req, res) {
	return _handleRealPredictionUnsubscription(req, res);
};



