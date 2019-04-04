/*
* @Author: Shiv Chawla
* @Date:   2019-04-01 00:30:02
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-04 21:49:54
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
		RedisUtils.subscribe(redisSubscriber, `sendRealtimeUpdates_${process.env.NODE_ENV}`);

		if (config.get('node_ib_event_port') == serverPort) {
			RedisUtils.subscribe(redisSubscriber, `processIBEvents_${process.env.NODE_ENV}`);	
		}

		RedisUtils.subscribe(redisSubscriber, `predictionAdded_${process.env.NODE_ENV}`);

	});

	redisSubscriber.on("message", function(channel, message) {
        if(channel == `sendRealtimeUpdates_${process.env.NODE_ENV}`) {     
			return Promise.all([
				MktPlaceController.sendAllUpdates(),
				PredictionRealtimeController.sendAllUpdates()
			]);       
        }

        else if(channel == `predictionAdded_${process.env.NODE_ENV}`) {     
			var advisorId = _.get(JSON.parse(message), 'advisorId', null);
			var userId = _.get(JSON.parse(message), 'userId', null);

			return Promise.all([
				advisorId ? PredictionRealtimeController.sendAdminUpdates(advisorId) : null,
				userId ? PredictionRealtimeController.sendUserUpdates(userId) : null
			]);			
        }

        else if (channel == `processIBEvents_${process.env.NODE_ENV}`) {
        	return BrokerRedisController.processIBEvents();
        }

    });

}

manageSubscriptions();







