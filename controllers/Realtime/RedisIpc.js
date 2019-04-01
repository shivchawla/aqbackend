/*
* @Author: Shiv Chawla
* @Date:   2019-04-01 00:30:02
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-01 12:37:05
*/

'use strict';
const config = require('config');
const Promise = require('bluebird');
const _ = require('lodash');
const redis = require('redis');

const serverPort = require('../../index').serverPort;

const PredictionRealtimeController = require('./predictionControl');
const MktPlaceController = require('./mktPlaceControl');
const BrokerRedisController = require('./brokerRedisControl');

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

		if (config.get('node_ib_event_port') == serverPort) {
			RedisUtils.subscribe(redisSubscriber, "processIBEvents");	
		}		

	});

	redisSubscriber.on("message", function(channel, message) {
        if(channel == "sendRealtimeUpdates") {     
			Promise.all([
				MktPlaceController.sendAllUpdates(),
				PredictionRealtimeController.sendAllUpdates()
			]);       
        }

        if (channel == "processIBEvents") {
        	BrokerRedisController.processIBEvents();
        }

    });

}

manageSubscriptions();







