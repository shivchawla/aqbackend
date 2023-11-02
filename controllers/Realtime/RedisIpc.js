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

let redisSubscriber;

async function getRedisSubscriber() {
	if (!redisSubscriber || !redisSubscriber.connected) {
		redisSubscriber = await RedisUtils.createClient({
            port: config.get('node_redis_port'), 
            host: config.get('node_redis_host'), 
            password: config.get('node_redis_pass')
        });
    }

    return redisSubscriber; 
}

(async() => {

	let redisSubscriber = await getRedisSubscriber();

	redisSubscriber.on('ready', function() {
		//Subscribe to real time update (ready message)
		RedisUtils.subscribe(redisSubscriber, `sendRealtimeUpdates_${process.env.NODE_ENV}`);

	});

})()







