/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 19:09:29
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-05 20:50:53
*/

'use strict';
const schedule = require('node-schedule');
const config = require('config');
const moment = require('moment-timezone');
const path = require('path');
const Promise = require('bluebird');
const _ = require('lodash');
const redis = require('redis');

const DateHelper = require('../utils/Date');
const serverPort = require('../index').serverPort;

const RedisUtils = require('../utils/RedisUtils');

var redisClient;

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
