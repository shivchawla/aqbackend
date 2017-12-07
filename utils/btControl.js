'use strict';
var redis = require('redis');
const redisUtils = require('../utils/RedisUtils');
const config = require('config');
const WebSocket = require('ws');
const BacktestModel = require('../models/Research/backtest');
const StrategyModel = require('../models/Research/strategy');
const schedule = require('node-schedule');
var fs = require('fs');
const SettingsParser = require('./btSettings.js');
const serverPort = require('../index').serverPort;

schedule.scheduleJob("0 * * * * *", function() {
    processBacktest(null);
});

var isBusy = {};

// Backtest output data
var outputData   = {};
// Subscription of test result
var subscribed = {};

// Response dictionary for each backtest
var response = {};

//Dict to record currently running backtest
var currentlyRunning = {};

//track the timerId of the backtests
var sendBacktestTimerId = {};

var saveBacktestTimerId = {};

var serverTimer = {};

//Variable to store execution detail of the backtest
var executionDetail = {};

var freshSubscription = {};
var lastIndexSent = {};
var lastChunkSent = {};

redisUtils.insertKeyValue(`numFailedRequests-${serverPort}`, 0);

var numAttempts = {};
var numRequests = 0;
function getConnectionForBt() {
    var machines = config.get('btmachines');
    var machine = machines[numRequests++ % machines.length];

    console.log(`Using machine: ${machine.host}:${machine.port} for request#: ${numRequests}`);
    return 'ws://' + machine.host + ":" + machine.port;
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
    BacktestModel.fetchBacktest({_id: backtestId, deleted: false}, {select: 'status'})
    .then(bt => {
        if(!bt) {
            throw new Error("Backtest not found");
        }
        if(bt.status === "complete" || bt.status === "exception") {
            // Backtest was already completed
            console.log("backtest already completed");
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
        sendBacktestTimerId[backtestId] = setInterval(function(){sendData(backtestId, false);}, config.get('time_interval_realtime_output')); 
    }
}

function clearSendDataTimer(backtestId) {
    if(backtestId in sendBacktestTimerId) {
        clearInterval(sendBacktestTimerId[backtestId]);
        delete sendBacktestTimerId[backtestId];
        
        setTimeout(function(){delete response[backtestId];}, 5000);
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

    BacktestModel.fetchBacktest({
        _id: req.backtestId
    }, {})
    .then(bt => {
        if (!bt) {
            return console.error("No backtest found");
        }

        StrategyModel.fetchStrategy({
            _id: bt.strategy
        }, {})
        .then(st => {
            if (!st) {
                return console.error("No strategy found");
            }

            // epoch time (measure for time of request)
            req.time = (new Date()).getTime();
            // userId of the requesting user
            req.userId = st.user._id;
            // Date range for the simulation
            req.date_range = new Date(bt.settings.endDate) - new Date(bt.settings.startDate);

            saveBacktest(req, res);
        })
        .catch(err => {
            return console.error("Error occured: " + err);
        });
    })
    .catch(err => {
        return console.error("Error occured: " + err);
    });
}

function saveBacktest(req, res) {
    // ===============================
    // 2. Save the backtest to redis
    // ===============================
    // backtest-request-queue contains key-value pairs
    // where each key is the backtestId pointing to the corresponding backtest request
    redisUtils.insertIntoRedis(`backtest-request-queue-${serverPort}`, req.backtestId, JSON.stringify(req));
    
    // Save the rsponse server
    response[req.backtestId] = res;

    //Initialize array to save execution details
    executionDetail[req.backtestId] = [];

    // Now we handle the requests
    processBacktest(null);
}

function processBacktest(backtestId) {
    // ===================================================================
    // 3. This step comprises of the following:
    //    a. Get a free server
    //    b. Pop the top priority backtest from redis
    //    c. Send this backtest, to the server found in a., for execution
    // ===================================================================
     
    // Server is available
    // Let's retrieve pending backtest requests from Redis
    redisUtils.getAllFromRedis(`backtest-request-queue-${serverPort}`, function(err, data) {
        if(err) {
            return console.error("Error: " + err);
        }
        if (!data) {
            // Redis is empty
            return;
        }
        
        if (!backtestId) {
            // Backtest requests queue
            let queue = Object.keys(data).map(function(x) {
                return JSON.parse(data[x]);
            });

            // Pop the top priority element from queue
            var topOfTheQueue = popTopPriority(queue);        
            //If there is nothing more to run (req is NULL)
            if(!topOfTheQueue) {
                return;
            }
    
            backtestId = topOfTheQueue.backtestId;
        }
        
        if (currentlyRunning[backtestId]) {
            console.log("Already Running: " + backtestId);
            return;
        }

        currentlyRunning[backtestId] = true;

        var server = getConnectionForBt();
    
        // Send this backtest request for execution
        execBacktest(backtestId, server, function(err, data) {
            // Callback function
            // This is called when one of the servers finish processing a backtest
            // and is ready to accept another backtest

            //Update Execution Detail
            /*if(backtestId in executionDetail) {
                executionDetail[backtestId].push(execDetails);
                
                //Add execution details to output
                data["executionDetail"] = executionDetail[backtestId];    
            }*/

            numAttempts[backtestId] = (backtestId in numAttempts) ? numAttempts[backtestId] + 1 : 1;

            if(err) {
                // This particular backtest couldn't be completed
                console.error("Error Occured:");
                console.error(err);

                // Let's put it's status to pending
                updateBacktestResult(backtestId, {status: "exception"});//, executionDetail: executionDetail[backtestId]});
            
            } else if(data.status === "pending") {
                //denied connection
                delete currentlyRunning[backtestId];
                delete outputData[backtestId];
                clearSendDataTimer(backtestId);

                if(numAttempts[backtestId] % config.get('btmachines').length != 0) {
                    console.log(`Server: ${server} unavailable. Moving to next connection`);
                    processBacktest(backtestId);
                } else {
                    redisUtils.incValue(`numFailedRequests-${serverPort}`, 1);
                    redisUtils.getValue(`numFailedRequests-${serverPort}`, function(err, data){
                        if(data) {
                            console.log(`Number of Failed Requests: ${data}`);
                            
                            /*if(data > MAX_FAILED_REQUESTS) {
                                //SEND AN EMAIL to admin: TODO
                            }*/
                        }
                    });
                    console.log("All Servers Unavailable!! Will retry in 1 minute")
                }
                return; 
              
            } else if(data.status === "exception") {
                // Some error occured in the processing of backtest
                // Or otherwise Julia returned an error
                console.error("Exception in backtest occured");
                updateBacktestResult(backtestId, data);

            } else {
                // Backtest successfully completed
                // Update the db with output
                updateBacktestResult(backtestId, data);
            }

            // Delete this backtest from redis
            redisUtils.deleteFromRedis(`backtest-request-queue-${serverPort}`, backtestId, function(err, reply) {
                if (err) {
                    return console.error(err);
                } 

                //clearSaveDataTimer(backtestId, true);
                redisUtils.setDataExpiry(`backtest-realtime-${backtestId}`, 20);
                redisUtils.setDataExpiry(`backtest-final-${backtestId}`, 1);
                //delete response[backtestId];
                delete currentlyRunning[backtestId];
                delete numAttempts[backtestId];
            });
        });

    });
}

function execBacktest(backtestId, conn, cb) {
    // ===============================
    // 4. Start execution of backtest
    // ===============================

    console.log('execBacktest is called');
    var executionDetails = {"server": conn};

    BacktestModel.fetchBacktest({_id: backtestId}, {})
    .then(bt => {

        if(!bt){
            throw new Error("Invalid Backtest");
        }

        var argsArray = SettingsParser.parseSettings(bt, false);
        argsArray = argsArray.concat(['--backtestid', backtestId]);

        return argsArray;
        
    })
    .then(argArray => {

        // TO DO: Progressively try to make connections with open julia process
        // create a string to bool dictioanry
        var btClient, backtestData = '';
        
        var subscriber = redis.createClient(config.get('redis_port'), config.get('redis_host'));

        var juliaError = false;
        outputData[backtestId] = [];
        
        //Flag to check whether Julia server is busy or free
        var serverDeniedRequest = false;

        try {
            executionDetails["wsOpenRequestTime"] = new Date();
            btClient = new WebSocket(conn);
        } catch(err) {
            var errMsg = "Error: Opening WS connection: "+ conn;
            executionDetails["error"] = errMsg;
            console.log(errMsg);
            serverDeniedRequest = true;
            cb(null, {status:"pending"});
        }

        btClient.on('error', function() {
            var errMsg = "Error: Opening WS connection: "+ conn;
            executionDetails["error"] = errMsg;
            console.log(errMsg);
            serverDeniedRequest = true;
            cb(null, {status:"pending"});
            clearSendDataTimer(backtestId);
        });

        btClient.on('open', function() {
            console.log('Connection Open');
            executionDetails["wsOpenTime"] = new Date();

            try {
                //Delete any data for this backtestId in redis
                //Mosty, it won't be there bu just in case

                redisUtils.deleteKey(`backtest-realtime-${backtestId}`);
                redisUtils.deleteKey(`backtest-final-${backtestId}`);

                btClient.send(JSON.stringify({args:argArray.join("??##"), requestType:"execute"}));

            } catch(err) {
                var errMsg = "Error: Sending message to WS connection: "+ conn; 
                executionDetails["error"] = errMsg;
                console.log(errMsg);
                serverDeniedRequest = true;
                cb(null, {status:"pending"});
            }
            
        });

        btClient.on('message', function(data) {
            //Now only called when connection is refused
            //Now, real-time data comes through Redis PUB/SUB
            try {
                const dataJSON = JSON.parse(data);

                if(dataJSON.outputtype === "internal") {
                    if(dataJSON.code == 503) {
                        serverDeniedRequest = true;
                        cb(null, {status:"pending"});
                    } else if(dataJSON.code == 200) {
                        //Request Accepted
                        subscriber.subscribe(`backtest-realtime-${backtestId}`);
                        subscriber.subscribe(`backtest-final-${backtestId}`);

                        //Create timer function to send data to FE
                        if(subscribed[backtestId]) {
                            setSendDataTimer(backtestId);
                        }
                    }
                }
            }
            catch (e) {
                console.log(e);
            }
        });
   
        subscriber.on("message", function(channel, message) {
          
            if(channel.indexOf("backtest-realtime") != -1) {     
                var backtestId = channel.split("-")[2];
                try {
                    const dataJSON = JSON.parse(message);
               
                    if(dataJSON.outputtype === 'log' && dataJSON.messagetype === "ERROR") {
                        juliaError = true;
                    } else if(dataJSON.outputtype === "internal") {
                        juliaError = true;
                    }
                }
                catch (e) {
                    console.log(e);
                }
            }

            if(channel.indexOf("backtest-final") != -1) {
                var backtestId = channel.split("-")[2];
                setTimeout(function(){saveData(backtestId, cb, juliaError);}, 1000);    
            }
        });
    })
    .catch(err => {
        cb(err, {status:"exception"});
    });

}

function saveData(backtestId, cb, juliaError) {
    //fetch all the data from the redis Queue "backtest-final-${backtestId}"
    redisUtils.getRangeFromRedis(`backtest-final-${backtestId}`, 0 , -1, function(err, data) {
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
            
                var status = juliaError ? "exception" : "complete";
                
                cb(null, {status:status, output: fOutput});
             } catch (e) {
                console.log(e);
                cb(e, {status:'exception', output: fOutput});
            }
        }

        if(err) {
            console.log(err);
            cb(e, {status:"exception"});
        }
    });
}

// Send backtest output to front-end
function sendData(backtestId, final) {
    var noresponse = !(backtestId in response);

    //console.log("In Sending");
    if(backtestId in response && subscribed[backtestId]) {
        //Retrieve the  websocket response variable for the backtestId
        var res = response[backtestId];

        redisUtils.getRangeFromRedis(`backtest-realtime-${backtestId}`, 0, -1, function(err, dataArray) {

            if(err) {
                console.log("No Data found in redis");
                clearSendDataTimer(backtestId);          
            }

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
        });  
    }
}

// Save backtest data to databse
function updateBacktestResult(backtestId, data) {
    console.log(`Updating Backtest: ${backtestId}`);
    BacktestModel.updateBacktest({
        _id: backtestId
    }, data);
}

// Find free Julia server
function findFreeServer() {
    for(var conn in isBusy) {
        if (isBusy.hasOwnProperty(conn) && !isBusy[conn]) {
            return conn;
        }
    }
    // Oh no, none of the servers are free
    return null;
}

//Reset the server to FREE 
function setServerFree(server) {
    isBusy[server] = false;
    if(server in serverTimer) {
        clearInterval(serverTimer[server])
        delete serverTimer[server];
    }
}

//Set the server busy
function setServerBusy(server) {
    isBusy[server] = true;
    clearInterval(serverTimer[server]);
    //unset it to free in 30s 
    serverTimer[server] = setInterval(function(){setServerFree(server);}, 30000)
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
