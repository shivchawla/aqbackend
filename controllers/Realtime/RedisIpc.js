/*
* @Author: Shiv Chawla
* @Date:   2019-04-01 00:30:02
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-13 11:49:46
*/

'use strict';
const config = require('config');
const Promise = require('bluebird');
const _ = require('lodash');
const redis = require('redis');

const serverPort = require('../../index').serverPort;

const RedisUtils = require('../../utils/RedisUtils');

let redisClient, redisSubscriber;

function getRedisSubscriber() {
	if (!redisSubscriber || !redisSubscriber.connected) {
		var redisPwd = config.get('node_redis_pass');

		if (redisPwd != "") {
        	redisSubscriber = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: redisPwd});
    	} else {
    		redisSubscriber = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'));
    	}
    }

    return redisSubscriber; 
}

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

	let redisSubscriber = getRedisSubscriber();

	redisSubscriber.on('ready', function() {
		//Subscribe to real time update (ready message)
		RedisUtils.subscribe(redisSubscriber, `sendRealtimeUpdates_${process.env.NODE_ENV}`);

	});

}

manageSubscriptions();







