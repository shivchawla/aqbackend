/*
* @Author: Shiv Chawla
* @Date:   2019-02-15 16:20:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-02-15 17:12:19
*/

'use strict'
const UserModel = require('../../models/user');
const Promise = require('bluebird');
const _ = require('lodash');

module.exports.resetBacktestCounter = function() {
	return UserModel.countUsers()
	.then(count => {
		const MAX = 100;
		var array = Array.from(new Array(Math.ceil(count/MAX)).keys());

		return Promise.mapSeries(array, function(skip) {
			return UserModel.fetchUsers({}, {_id: 1}, {skip: skip*MAX, limit:MAX})
			.then(users => {
				return Promise.map(users, function(user) {
					return UserModel.resetBacktestCounter({_id: user._id})
						
				});
			});
		});
	});
};

module.exports.isBacktestCapacityAvailable  = function(userId) {
	return UserModel.fetchUser({_id: userId}, {backtestSubscription:1})
	.then(user => {
		if (user) {
			var currentCount = _.get(user, 'backtestSubscription.counter', 0);
			var maximum = _.get(user, 'backtestSubscription.maximum', config.get('default_backtest_limit'));

			return currentCount < maximum;
		} else {
			throw new Error("Invalid User");
		}
	})
};

module.exports.increaseBacktestCounter  = function(userId) {
	return UserModel.shiftBacktestCounter({_id: userId}) 
};