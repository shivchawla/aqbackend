/*
* @Author: Shiv Chawla
* @Date:   2019-02-15 16:20:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-02-19 12:50:08
*/

'use strict'
const UserModel = require('../../models/user');
const Promise = require('bluebird');
const _ = require('lodash');
const config = require('config');
const BacktestModel = require('../../models/Research/backtest');
const spawn = require('../Realtime/spawn');

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
	return UserModel.shiftBacktestCounter({_id: userId}, 1) 
};

module.exports.decreaseBacktestCounter  = function(userId) {
	return UserModel.shiftBacktestCounter({_id: userId}, -1) 
};

module.exports.createBacktest = function(userId, strategy, settings) {
    const backtest = {
        strategy: strategy._id,
        settings: settings,
        code: strategy.code,
        type: strategy.type,
        entryConditions: strategy.entryConditions,
        exitConditions: strategy.exitConditions,
        entryLogic:strategy.entryLogic,
        exitLogic:strategy.entryLogic,
        name: strategy.name,
        strategy_name: strategy.name,
        status : 'active',
        createdAt : new Date(),
        shared:false,
        deleted:false,
    };
    
    return Promise.all([
    	exports.increaseBacktestCounter(userId),
    	BacktestModel.saveBacktest(backtest)
	])
    .then(([x, bt]) => {
        if(bt) {
            var req = {action:'exec-backtest', backtestId: bt._id};
            try {
                return spawn.handleAction(req, null)
                .then(() =>{
                    return bt;
                })
            } catch(err) {
                console.log(err);
            }
        } 
    })
}

// Save backtest data to databse
module.exports.updateBacktestResult = function(backtestId, updates) {
   	console.log(`Updating Backtest: ${backtestId}`);
 	
 	return BacktestModel.fetchBacktest({_id: backtestId})
    .then(bt => {
        if(_.get(updates, 'status', "exception") == "exception") {
        	var userId = _.get(bt, 'strategy.user._id', null);
            return userId ? exports.decreaseBacktestCounter(userId) : null;
        }
    })
    .then(() => {
    	return BacktestModel.updateBacktest({_id: backtestId}, updates);
	})
}






