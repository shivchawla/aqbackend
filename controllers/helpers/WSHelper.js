/*
* @Author: Shiv Chawla
* @Date:   2018-04-25 16:09:37
* @Last Modified by:   Shiv Chawla
<<<<<<< HEAD
* @Last Modified time: 2019-03-25 19:16:41
=======
* @Last Modified time: 2019-03-15 12:03:13
>>>>>>> New-Minute-Data
*/
'use strict';
var redis = require('redis');
const RedisUtils = require('../../utils/RedisUtils');
const config = require('config');
const WebSocket = require('ws');
const serverPort = require('../../index').serverPort;
const APIError = require('../../utils/error');
const _ = require('lodash');

var redisClient;

function getRedisClient() {
    if (!redisClient || !redisClient.connected) {

        let redisPwd = config.get('node_redis_pass');
        if (redisPwd != "") {
            redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: redisPwd});  
        } else {
            redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'));  
        }

        RedisUtils.insertKeyValue(redisClient, `numFailedRequests-${serverPort}`, 0);    
    }

    return redisClient;
}

var numAttempts = {};
var numRequests = 0;

function getConnectionForMktPlace(purpose) {
    
    var machines = config.get('mktMachines');
    if (purpose == "update_realtime_prices") {
	    var dedicatedMachines = machines.filter(item => {return item.dedicatedParent == serverPort;});
    	
    	numRequests++;
    	if (dedicatedMachines.length > 0) {
    		var machine = dedicatedMachines[0];
    		//console.log(`Using machine: ${machine.host}:${machine.port} for request#: ${numRequests} (to update price)`);
	    	return 'ws://' + machine.host + ":" + machine.port;
    	} /*else {
    		console.log(`No dedicated machines found for serverPort: ${serverPort}`);
    		console.log("Continue to use first available machine");
    	}*/
    }

	var machine = machines[numRequests++ % machines.length];
    //console.log(`Using machine: ${machine.host}:${machine.port} for request#: ${numRequests}`);
    return 'ws://' + machine.host + ":" + machine.port;
}


module.exports.handleMktRequest = function(requestMsg, resolve, reject, options) {
	
    let connection = _.get(options, 'connection', null);
    let maxAttempts = _.get(options, 'maxAttempts', 5);

    if(maxAttempts == 0) {
    	reject(APIError.jsonError({message: "Websocket is inactive for long. Will try later. Finishing!!"}));
    	return;
    }

    if (!connection) {
    	try {
    		connection = getConnectionForMktPlace(JSON.parse(requestMsg).action);
    	} catch (err) {
    		console.log("Error while picking WS connection");
    		console.log(err.message);
    	}
	} 

	try {
    	var wsClient = new WebSocket(connection); 
	} catch(err) {
		reject(APIError.jsonError({message: `Error connecting to ${connection}`}));
		return;
	}

    //Re-connect on WS error
    wsClient.on('error', function(err) {
        console.log(`Error connecting to WS at ${connection}`);
        setTimeout(function() {
            // we must choose the same server when updating realtime prices
            // other wise server may not get updated
            var parsedMsg = JSON.parse(requestMsg);
            if (parsedMsg.action == "update_realtime_prices") {
                exports.handleMktRequest(requestMsg, resolve, reject, Object.assign(options ? options : {}, {maxAttempts: maxAttempts - 1}));
            } else {
                exports.handleMktRequest(requestMsg, resolve, reject, Object.assign(options ? options : {}, {maxAttempts: maxAttempts - 1}));
            }
        }, 1000);        
    });

    wsClient.on('open', function open() {
     	wsClient.send(requestMsg);
    });

    wsClient.on('message', function(outputMsg) {
    	var data = JSON.parse(outputMsg);
		
    	if (data["error"] == "") {
		    resolve(data["output"]);
	    } else if (data["error"] != "" && data["code"] == 400) {
	    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
	    } else if (data["error"] != "" && data["code"] == 503) {

	    	///FOR NOW THIS FEATURE IS TUNED OFF
	    	// JULIA HAS NO PENDING REQUEST FEATURE
	    	console.log(`Request rejected for host: ${connection}`);
	    	//Retry after 1 second
	    	setTimeout(function() {
	    		// we must choose the same server when updating realtime prices
	    		// other wise server may not get updated
	    		var parsedMsg = JSON.parse(requestMsg);
	    		if (parsedMsg.action == "update_realtime_prices") {
	    			exports.handleMktRequest(requestMsg, resolve, reject, Object.assign(options ? options : {}, {maxAttempts: maxAttempts - 1}));
	    		} else {
	    			exports.handleMktRequest(requestMsg, resolve, reject, Object.assign(options ? options : {}, {maxAttempts: maxAttempts - 1}));
	    		}
	    	}, 1000);		

	    } else {
	    	console.log("Failed for request");
	    	console.log(requestMsg);
	    	reject(APIError.jsonError({message: `Internal error: ${JSON.parse(requestMsg).action}`, errorCode: 2101}));
	    }
    });
};
