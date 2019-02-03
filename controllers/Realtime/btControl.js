'use strict';
var redis = require('redis');
const Promise = require('bluebird');
const config = require('config');
const WebSocket = require('ws');
const schedule = require('node-schedule');
var fs = require('fs');
const _ = require('lodash'); 

const RedisUtils = require('../../utils/RedisUtils');
const SettingsParser = require('./btSettings.js');
const serverPort = require('../../index').serverPort;
const BacktestModel = require('../../models/Research/backtest');
const StrategyModel = require('../../models/Research/strategy');

var redisClient = null; 

setTimeout(reSubscribeAfterConnection, 5000);
setInterval(checkCompletionSet, 10000);

var polledBacktestsForCompletion = {};

//Track julia error for backtest 
//If julia error = TRUE, final output is saved as just {status: 'exception'} 
var juliaError = {};

// Subscription of test result
var subscribed = {};

// Response dictionary for each backtest
var response = {};

//track the timerId of the backtests
var sendBacktestTimerId = {};

var freshSubscription = {};
var lastIndexSent = {};
var lastChunkSent = {};

var backtestCompleted = {};

const BACKTEST_QUEUE = `backtest-request-queue-${process.env.NODE_ENV}`;
const THIS_PROCESS_BACKTEST_SET = `backtest-request-set-${serverPort}`;
const COMPLETE_BACKTEST_SET  = `backtest-completion-set-${process.env.NODE_ENV}`;

function realtimeOutputChannel(backtestId) {
    return `backtest-realtime-${backtestId}`;
}

function finalOutputChannel(backtestId) {
    return `backtest-final-${backtestId}`;
}

function getRedisClient() {
    if (!redisClient || !redisClient.connected) {
        redisClient = redis.createClient(config.get('julia_redis_port'), config.get('julia_redis_host'), {password: config.get('julia_redis_pass')});
        
        redisClient.on("ready", function() {
            // Let's retrieve pending backtest requests from Redis for this process
            return RedisUtils.getAllFromRedis(redisClient, THIS_PROCESS_BACKTEST_SET, 0, -1)
            .then(data => {
               
                if (!data) {
                    // Redis is empty
                    return;
                }

                //Re-subscribe to the channels
                return Promise.mapSeries(Object.keys(data), function(key) {
                    var req = JSON.parse(data[key]);

                    var nodePort = req.nodePort;
                    var backtestId = req.backtestId;

                    if (nodePort != serverPort || !backtestId)  {
                        console.log("Error while fetching requests for this process");
                    }

                    //Fetch the status of this backtest, in Completion Set
                    return RedisUtils.getFromRedis(redisClient, COMPLETE_BACKTEST_SET, backtestId)
                    .then(found => {
                        if (found) {
                            //Use this flag before subscribing realtime data
                            backtestCompleted[backtestId] = true;
                            return saveData(backtestId);
                        }

                        //Other-wise subscribe;
                        juliaError[backtestId] = false;
                        return handleRedisSubscription(backtestId);
                    })
                    
                });
            })
            .catch(err => {
                console.error(`Error reading active requests from redist set: ${serverPort}`);
                console.log(err);
            })
        });

        redisClient.on("message", function(channel, message) {
            
            var backtestId = channel.split("-")[2];

            if(channel.indexOf("backtest-realtime") != -1) {     
                try {
                    const dataJSON = JSON.parse(message);
                
                    if(dataJSON.outputtype === 'log' && dataJSON.messagetype === "ERROR") {
                        juliaError[backtestId] = true;
                    } else if(dataJSON.outputtype === "internal") {
                        juliaError[backtestId] = true;
                    }
                }
                catch (e) {
                    console.log(e);
                }
            }

            if(channel.indexOf("backtest-final") != -1) {
                setTimeout(function(){saveData(backtestId);}, 1000);    
            }
        });
    } 

    return redisClient;
}

/* =====================================
        SUBSCRIPTION CONTROLLER
===================================== */

//Function to subscribe WS data from backend to UI
function handleSubscription(req, res, fresh) {
    /* Two cases :
        1. Execution of backtest is going on/will be done
        2. Backtest was already completed long time back
    */
    var backtestId = req.backtestId;
    return BacktestModel.fetchBacktest({_id: backtestId, deleted: false}, {select: 'status'})
    .then(bt => {
        if(!bt) {
            throw new Error("Backtest not found");
        }
        if(bt.status === "complete" || bt.status === "exception" || backtestCompleted[backtestId]) {
            // Backtest was already completed
            console.log("Backtest already completed");
            return res.send(JSON.stringify({backtestId: backtestId, strategyId: bt.strategy._id, status: bt.status}));
            //res.send(JSON.stringify(bt.output));
        } else {
            // Backtest is till running or will run after some time
            freshSubscription[backtestId] = fresh ? fresh : false;
            subscribed[backtestId] = true;

            if(!res) {
                console.log("Response Variable is null");
            }

            response[backtestId] = res;
            
            if (!(backtestId in sendBacktestTimerId)) {
                //set new timer
                setSendDataTimer(backtestId);   
            }

            return handleRedisSubscription(backtestId);
        }
    })
    .catch(err => {
        console.error(err);
    });
}

function setSendDataTimer(backtestId) {
    //Create timer function to send data to FE
    //If valid UI websocket connection
    if(!(backtestId in sendBacktestTimerId)) {
        sendBacktestTimerId[backtestId] = setInterval(function(){sendData(backtestId);}, config.get('time_interval_realtime_output')); 
    }
}

function clearSendDataTimer(backtestId) {
    if(backtestId in sendBacktestTimerId) {
        clearInterval(sendBacktestTimerId[backtestId]);
        delete sendBacktestTimerId[backtestId];
    }
}

//Function to unsubscribe WS data from backend to UI
function handleUnsubscription(req) {
    var backtestId = req.backtestId;
    //Call send data
    //Send data automaticaly stops or reject the call if backtest has completed
    subscribed[backtestId] = false;
    clearSendDataTimer(backtestId);
}

/* =====================================
        BACKTEST CONTROLLER
===================================== */ 
function handleBacktest(req, res) {
    // ===========================================
    // 1. Append priority details to the request
    // ===========================================

    var backtestId = req.backtestId;
    
    // Save the rsponse server
    response[backtestId] = res; 

    return BacktestModel.fetchBacktest({_id: req.backtestId}, {})
    .then(bt => {
        if (!bt) {
            return console.error("No backtest found");
        }

        return Promise.all([bt, StrategyModel.fetchStrategy({_id: bt.strategy}, {})]);
    })
    .then(([bt, st]) => {
        if (!st) {
            return console.error("No strategy found");
        }

        var argArray = SettingsParser.parseSettings(bt, false);
        argArray = argArray.concat(['--backtestid', backtestId]).join("??##");

        req.argArray = argArray;

        // epoch time (measure for time of request)
        req.requestTime = (new Date()).getTime();

        // userId of the requesting user
        req.userId = st.user._id;

        // Date range for the simulation
        req.date_range = new Date(bt.settings.endDate) - new Date(bt.settings.startDate);

        req.nodePort = serverPort;

        return saveRequestInQueue(req);
    })
    .catch(err => {
        console.error("Error occured: " + err);
    });
}

function saveRequestInQueue(req) {
    // ===============================
    // 2. Save the backtest to redis
    // ===============================
    // backtest-request-queue contains key-value pairs
    // where each key is the backtestId pointing to the corresponding backtest request
    return Promise.all([
        RedisUtils.pushToRangeRedis(getRedisClient(), BACKTEST_QUEUE, JSON.stringify(req)),
        RedisUtils.insertIntoRedis(getRedisClient(), THIS_PROCESS_BACKTEST_SET, req.backtestId.toString(), JSON.stringify(req)),
    ]);
}

function saveData(backtestId) {
    
    let status = "exception";

    return new Promise(resolve => {
        //Fetch all the data from the redis Queue "backtest-final-${backtestId}"
        return BacktestModel.fetchBacktest({_id: backtestId, deleted: false}, {select: 'status'})
        .then(bt => {
            if(!bt) {
                console.log("Backtest not found");
                resolve(true);
            }

            if(bt.status === "complete" || bt.status === "exception") {
                console.log("Backtest status is already updated");
                resolve(true);
            }
        })
        .then(() => {
            if (!_.get(juliaError, backtestId, false)) {
                return RedisUtils.getRangeFromRedis(getRedisClient(), finalOutputChannel(backtestId), 0 , -1);
            } else {
                throw new Error ("Julia Error");
            }
        })
        .then(data => {
            if(data) {
                let fOutput='';
                try {
                    var dataArray = new Array(data.length);
                    
                    var i = 0;
                    
                    data.forEach(item => {
                        dataArray[i++] = JSON.parse(item);
                    });

                    dataArray.sort(function compare(a, b) {
                        if (a.index < b.index) {
                            return -1;
                        } else if (a.index > b.index) {
                            return 1;
                        }
                        return 0;
                    })

                    fOutput = JSON.parse(dataArray.map(item => item.data).join(""));
                    
                    //Even with output, status could be exceptions (output will only contain logs)
                    status = _.get(juliaError, backtestId, false) ? "exception" : "complete";
                    
                    return {output: fOutput, status};
                    
                } catch (e) {
                    console.log(e);
                    throw new Error(`Error while processing redis data: ${backtestId}`);
                }
            } else {
                throw new Error(`No redis data found for ${backtestId}`);
            }    
        })
        .then(data => {
            console.log("Saving to DB");
            resolve(updateBacktestResult(backtestId, data));
        })
        .catch(err => {
            console.error(err);
           
            // Let's put it's status to exception
            resolve(updateBacktestResult(backtestId, {status}));
        })
    })
    .then(() => {

        if(backtestId in response && subscribed[backtestId]) {
            var res = response[backtestId]
            res.send(JSON.stringify({backtestId: backtestId, status}));
        }
       
        //remove julia error status
        delete juliaError[backtestId];
        delete backtestCompleted[backtestId];

        //remove the polled status;
        delete polledBacktestsForCompletion[backtestId];
        
        // Delete this backtest from redis (from this process SET)
        return Promise.all([
            RedisUtils.deleteFromRedis(getRedisClient(), THIS_PROCESS_BACKTEST_SET, backtestId),
            RedisUtils.deleteFromRedis(getRedisClient(), COMPLETE_BACKTEST_SET, backtestId)
        ])
        .then(() => {
            
            //Expire the channels
            RedisUtils.setDataExpiry(getRedisClient(), realtimeOutputChannel(backtestId), 20);
            RedisUtils.setDataExpiry(getRedisClient(), finalOutputChannel(backtestId), 1);

            //Unsubscribe the channels
            RedisUtils.unsubscribe(getRedisClient(), realtimeOutputChannel(backtestId));
            RedisUtils.unsubscribe(getRedisClient(), finalOutputChannel(backtestId));

        })
        .catch(err => {
            console.error(err);
        })
    })
}

// Send backtest output to front-end
function sendData(backtestId, final) {
    var noresponse = !(backtestId in response);

    if(backtestId in response && subscribed[backtestId]) {
        //Retrieve the  websocket response variable for the backtestId
        var res = response[backtestId];

        return RedisUtils.getRangeFromRedis(getRedisClient(), realtimeOutputChannel(backtestId), 0, -1)
        .then(dataArray => {

            noresponse = !res;

            if(res && dataArray) {
                
                // Check if connection is OPEN
                if(dataArray.length > 0) {
                    if (res.readyState === WebSocket.OPEN) {
                        
                        let startIndex = 0;
                        //Check if it's a fresh subscription
                        startIndex = freshSubscription[backtestId] ? 0 : 
                                                (backtestId in lastIndexSent) ? lastIndexSent[backtestId] + 1 : 0;
                        
                        //fragment the data in chunk of 20
                        //save only 100 days in one document
                        var i,j,tempArray,chunk = 20;
                        
                        var chunkIndex = (backtestId in lastChunkSent && !freshSubscription[backtestId]) ? lastChunkSent[backtestId] : 0;
                        
                        for (i=startIndex,j=dataArray.length; i<j; i+=chunk) {
                            tempArray = dataArray.slice(i,i+chunk);
                            // do whatever
                            res.send(JSON.stringify({data:tempArray, backtestId: backtestId, chunked:true, size: chunk, index:chunkIndex++}));
                            lastChunkSent[backtestId] = chunkIndex;
                        }

                        //Update the last index sent and fresh Subscription flag
                        //Ideally, these should stored in a common global space
                        //Like REDIS or realtime database.. 
                        lastIndexSent[backtestId] = dataArray.length - 1;
                        freshSubscription[backtestId] = false;
                       
                    } else {
                        console.log("WebSocket is closed");
                        subscribed[backtestId] = false;
                        noresponse = true;
                    }         
                }      
            }

            if(noresponse) {
                console.log("In Send Data: No response variable");
                clearSendDataTimer(backtestId);
            }
        })
        .catch(err => {
            console.log("No Data found in redis");
            clearSendDataTimer(backtestId);          
        })  
    }
}

// Save backtest data to databse
function updateBacktestResult(backtestId, data) {
    console.log(`Updating Backtest: ${backtestId}`);
    return BacktestModel.updateBacktest({
        _id: backtestId
    }, data);
}

function reSubscribeAfterConnection() {
    //Get (gets the client and sets up various subscription channels)
    getRedisClient();
}

function handleRedisSubscription(backtestId) {

    if (backtestId ) {
        RedisUtils.subscribe(getRedisClient(), realtimeOutputChannel(backtestId));
        RedisUtils.subscribe(getRedisClient(), finalOutputChannel(backtestId));

        //Create timer function to send data to FE
        if(subscribed[backtestId]) {
            setSendDataTimer(backtestId);
        }

    } else {
        console.log("Invalid backtestId provided");
    }

    return;
}

function checkCompletionSet() {
    return RedisUtils.getAllFromRedis(getRedisClient(), THIS_PROCESS_BACKTEST_SET, 0, -1)
    .then(data => {
       
        if (!data) {
            // Redis is empty
            return;
        }

        //Re-subscribe to the channels
        return Promise.mapSeries(Object.keys(data), function(key) {
            var req = JSON.parse(data[key]);

            var nodePort = req.nodePort;
            var backtestId = req.backtestId;

            if (nodePort != serverPort || !backtestId)  {
                console.log("Error while fetching requests for this process");
            }

            return RedisUtils.getFromRedis(COMPLETE_BACKTEST_SET, backtestId)
            .then(found => {
                if (found) {
                    if (!polledBacktestsForCompletion[backtestId]) {

                        polledBacktestsForCompletion[backtestId] = true;

                        return saveData(backtestId);
                    }
                }
            });
        })
    });
}

// Function to pop out the top priority backtest from queue
function popTopPriority(arr) {
    // 1. Sort on the time of request
    arr.sort(function(x, y) {
        // Here x and y represent two different backtests

        let time_elapsed_X = (new Date()).getTime() - x.time;
        // Calculates the time elapsed since the backtest request X was made

        let time_elapsed_Y = (new Date()).getTime() - y.time;
        // Calculates the time elapsed since the backtest request Y was made

        return -(time_elapsed_X - time_elapsed_Y);
        // If time elapsed for X is more than Y then X gets higher priority
        // That means X should appear before Y in the queue
    });

    // 2. Put the first request from each user at front of the queue
    arr.forEach(function(currentItem, index, self) {
        for(var i = index+1; i<self.length; i++) {
            if (currentItem.userId === self[i].userId) {
                let temp = self.splice(i, 1);
                self.push(temp[0]);
            }
        }
    });
    // ================== Above algorithm is bad. O(n^2) :( ==================

    // 3. Sort on date range
    arr.sort(function(x, y) {
        return x.date_range - y.date_range;
        // Larger the date range, lower the priority
    });

    var top = arr.shift();

    if(!(top.backtestId in currentlyRunning)) {
        return top;   
    } else if (arr.length > 0) {
        return popTopPriority(arr);
    } else {
        return null;
    }
}

module.exports = {
    handleSubscription,
    handleUnsubscription,
    handleBacktest
}
