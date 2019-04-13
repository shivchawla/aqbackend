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

const PredictionRealtimeController = require('./predictionControl');
const MktPlaceController = require('./mktPlaceControl');
const BrokerRedisController = require('./brokerRedisControl');
const InteractiveBroker = require('./interactiveBroker');

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

		if (config.get('node_ib_event_port') == serverPort) {
			RedisUtils.subscribe(redisSubscriber, `processIBEvents_${process.env.NODE_ENV}`);	
		}

		RedisUtils.subscribe(redisSubscriber, `predictionAdded_${process.env.NODE_ENV}`);

		RedisUtils.subscribe(redisSubscriber, `predictionAdded_${process.env.NODE_ENV}`);

	  	RedisUtils.subscribe(redisSubscriber, `modifyOrder_${process.env.NODE_ENV}_complete`);

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

        else if (channel == `modifyOrder_${process.env.NODE_ENV}`) {
        	let orderParams = JSON.parse(message);

        	var clientId = Number(_.get(orderParams, "clientId", "-1"));
        	
        	var requestType = _.get(orderParams, 'requestType', 'modify');

        	//Handle modify order in this process
        	if (clientId !=-1 && clientId == serverPort) {

        		console.log("Process found for order modification at Client: ${clientId}");

        		Promise.resolve()
        		.then(() => {
        			if (requestType == 'modify') {
        				return InteractiveBroker.modifyOrder(orderParams);
    				} else if (requestType == 'cancel') {
    					return InteractiveBroker.cancelOrder(orderParams);
    				} 
        		})
        		.then(() => {
        			RedisUtils.publish(getRedisClient(), `modifyOrder_${process.env.NODE_ENV}_complete`, JSON.stringify({...orderParams, status: true}));
        		})
        		.catch(err => {
        			RedisUtils.publish(getRedisClient(), `modifyOrder_${process.env.NODE_ENV}_complete`, JSON.stringify({...orderParams, error: err}));
        		})

        	}
        }

        else if (channel == `modifyOrder_${process.env.NODE_ENV}_complete`) {
        	BrokerRedisController.handleOrderModificationCompleteResponse(JSON.parse(message));
    	}

    });

}

manageSubscriptions();







