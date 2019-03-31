/*
* @Author: Shiv Chawla
* @Date:   2019-04-01 00:30:02
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-01 00:47:51
*/

'use strict';
const config = require('config');
const Promise = require('bluebird');
const _ = require('lodash');
const redis = require('redis');

const PredictionRealtimeController = require('./predictionControl');
const MktPlaceController = require('./mktPlaceControl');

const RedisUtils = require('../../utils/RedisUtils');

let redisClient;

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

function manageSubscriptions() {

	let redisSubscriber = getRedisClient();

	redisSubscriber.on('ready', function() {
		//Subscribe to real time update (ready message)
		RedisUtils.subscribe(redisSubscriber, "sendRealtimeUpdates");
	});

	redisSubscriber.on("message", function(channel, message) {
        if(channel == "sendRealtimeUpdates") {     
			Promise.all([
				MktPlaceController.sendAllUpdates(),
				PredictionRealtimeController.sendAllUpdates()
			]);       
        }
    });
}

manageSubscriptions();

