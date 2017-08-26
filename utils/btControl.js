'use strict';
const redisUtils = require('../utils/RedisUtils');
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const BacktestModel = require('../models/backtest');
const StrategyModel = require('../models/strategy');
const schedule = require('node-schedule');

schedule.scheduleJob("0 * * * * *", function() {
    processBacktest(null);
});

var isBusy = {};

// Initialize map for status of each connection
// Our Julia server can only accept one connection per process
for(var machine of config.get('btmachines')) {
    let conn = 'ws://' + machine.host + ":" + machine.port;
    isBusy[conn] = false
}

// Backtest output data
var outputData   = {};
// Subscription of test result
var subscribed = {};

// Response dictionary for each backtest
var response = {};

/* =====================================
        SUBSCRIPTION CONTROLLER
===================================== */

//Function to subscribe WS data from backend to UI
function handleSubscription(req, res) {
    /* Two cases :
        1. Execution of backtest is going on/will be done
        2. Backtest was already completed long time back
    */
    var backtestId = req.backtestId;
    BacktestModel.fetchBacktest({
        _id: backtestId, deleted: false
    }, {})
    .then(bt => {
        if(!bt) {
            throw new Error("Backtest not found");
        }
        if(bt.status === "completed") {
            // Backtest was already completed
            res.send(JSON.stringify(bt.output));
        }
        else {
            // Backtest is till running or will run after some time
            subscribed[backtestId] = true;
        }
    })
    .catch(err => {
        console.error(err);
    });
}

//Function to unsubscribe WS data from backend to UI
function handleUnsubscription(req) {
    var backtestId = req.backtestId;
    //Call send data
    //Send data automaticaly stops or reject the call if backtest has completed
    subscribed[backtestId] = false;
}

/* =====================================
        BACKTEST CONTROLLER
===================================== */
function handleBacktest(req, res) {
    // ===========================================
    // 1. Append priority details to the request
    // ===========================================
    
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
    redisUtils.insertIntoRedis('backtest-request-queue', req.backtestId, JSON.stringify(req));
    // Save the rsponse server
    response[req.backtestId] = res;

    // Now we handle the requests
    processBacktest(null);
}

function processBacktest(connection) {
    // ===================================================================
    // 3. This step comprises of the following:
    //    a. Get a free server
    //    b. Pop the top priority backtest from redis
    //    c. Send this backtest, to the server found in a., for execution
    // ===================================================================
    let server, req, res, backtestId;
    if(!connection) {
        server = findFreeServer();
        if(!server) {
            console.log("No available server at the moment");
            return;
        }
    }
    else {
        server = connection;
    }

    // Server is available
    // Let's retrieve pending backtest requests from Redis
    redisUtils.getAllFromRedis('backtest-request-queue', function(err, data) {
        if(err) {
            isBusy[server] = false;
            return console.error("Error: " + err);
        }
        if (!data) {
            // Redis is empty
            isBusy[server] = false;
            return console.log("All backtests over!");
        }

        // Backtest requests queue
        let queue = Object.keys(data).map(function(x) {
            return JSON.parse(data[x]);
        });

        // Pop the top priority element from queue
        req = popTopPriority(queue);
        backtestId = req.backtestId;

        try {
            res = response[backtestId];
        } catch(err) {
            console.log("Valid UI Websocket not available for this backtest");
        }

        // Send this backtest request for execution
        execBacktest(backtestId, server, res, function(err, conn, data) {
            // Callback function
            // This is called when one of the servers finish processing a backtest
            // and is ready to accept another backtest
            if(err) {
                // This particular backtest couldn't be completed
                console.error("Error Occured:");
                console.error(err);

                // Let's put it's status to pending
                updateBacktestResult(backtestId, {status: "pending"});
            }
            else if(data.status === "exception") {
                // Some error occured in the processing of backtest
                // Or otherwise Julia returned an error
                console.error("Exception in backtest occured");

                // Let's put it's status to exception
                updateBacktestResult(backtestId, {status: "exception"});
            }
            else {
                // Backtest successfully completed
                // Update the db with output
                updateBacktestResult(backtestId, data);
            }
            // Delete this backtest from redis
            redisUtils.deleteFromRedis('backtest-request-queue', backtestId, function(err, reply) {
                if (err) {
                    return console.error(err);
                } 

                // Initiate processing after aysn delete is complete 
                // Start off with next backtest
                delete outputData[backtestId];
                delete response[backtestId];
                processBacktest(conn);
            });
        });
    });
}

function execBacktest(backtestId, conn, res, cb) {
    // ===============================
    // 4. Start execution of backtest
    // ===============================

    console.log('execBacktest is called');

    BacktestModel.fetchBacktest({
        _id: backtestId
    }, {})
    .then(bt => {
        var args = [];

        if(!bt){
            throw new Error("Invalid Backtest");
        }

        if(bt) {

            args = args.concat(['--code', CryptoJS.AES.decrypt(bt.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

            var settings = bt.settings;
            args = args.concat(['--capital', settings.initialCash]);
            args = args.concat(['--startdate', settings.startDate]);
            args = args.concat(['--enddate', settings.endDate]);
            args = args.concat(['--universe', settings.universe]);

            var advanced = settings.advanced;

            if(advanced.exclude) {
                args = args.concat(['--exclude', advanced.exclude]);
            }

            if(advanced.investmentPlan) {
                args = args.concat(['--investmentplan', advanced.investmentPlan]);
            }

            if(advanced.rebalance) {
                args = args.concat(['--rebalance', advanced.rebalance]);
            }

            if(advanced.cancelPolicy) {
                args = args.concat(['--cancelpolicy', advanced.cancelPolicy]);
            }

            if(advanced.resolution) {
                args = args.concat(['--resolution', advanced.resolution]);
            }

            if(advanced.commission) {
                var commission = advanced.commission.model + ',' + advanced.commission.value.toString();
                args = args.concat(['--commission', commission]);
            }

            if(advanced.slippage) {
                var slippage = advanced.slippage.model + ',' + advanced.slippage.value.toString();
                args = args.concat(['--slippage', slippage]);
            }
        }

        return args;
    })
    .then(argArray => {

        // TO DO: Progressively try to make connections with open julia process
        // create a string to bool dictioanry
        var btClient, backtestData = '', poll;

        var juliaError = false;
        outputData[backtestId] = [];

        btClient = new WebSocket(conn);

        btClient.on('open', function() {
            console.log('Connection Open');

            btClient.send(argArray.join("??##"));
            subscribed[backtestId] = true;

            redisUtils.insertKeyValue(backtestId + '-data', JSON.stringify(outputData[backtestId]));

            //If valid UI websocket connection
            if(res) {
                poll = setInterval(function(){sendData(res, backtestId);}, config.get('time_interval_realtime_output'));
            }

        });

        btClient.on('message', function(data) {
            
            try {
                const dataJSON = JSON.parse(data);
                dataJSON.backtestId = backtestId;

                if (dataJSON.outputtype === 'backtest') {
                    backtestData = dataJSON;
                }
                else {
                    outputData[backtestId].push(dataJSON);

                    if(dataJSON.outputtype === 'log') {
                        if(dataJSON.messagetype === "ERROR") {
                            juliaError = true;
                            //throw new Error("");
                        }
                    }
                }
            }
            catch (e) {
                console.log(e);
            }
        });

        btClient.on('close', function close(code) {
            console.log('Connection Closed');
            console.log(conn);
            clearInterval(poll);
            
            //If backtest stops suddenly, a message must be sent to the UI
            //about unexpected error
            if(!juliaError && backtestData && Object.keys(backtestData).length == 0) {
                const dataJSON = {messagetype:"ERROR", outputtype: "log", message:"Internal Exception"};
                outputData[backtestId].push(dataJSON);
            }

            // Send data to th UI for one last time
            sendData(res, backtestId);

            // Update the connection status
            if (code === 1000) {
                try {

                    var status = "complete";
                    
                    if(juliaError) {
                        status = "exception";
                    }
                    
                    if(backtestData && Object.keys(backtestData).length > 0) {
                        cb(null, conn, {output: backtestData, status:status});
                    }
                    else {
                        // This gets triggered when no performance data comes
                        // and backtest finishes
                        cb(null, conn, {status:"exception"});
                    }
                }
                catch (e) {
                    cb(e, conn, {status:"exception"});
                }
            }
            else {
                cb(null, conn, {status:"exception"});
            }

        });

    })
    .catch(err => {
        cb(err, conn, {status:"exception"});
    });
}

// Send backtest output to front-end
function sendData(res, backtestId) {

    if(res) {
        var dataArray = outputData[backtestId];

        if (dataArray && dataArray.length > 0) {
            redisUtils.insertKeyValue(backtestId + '-data', JSON.stringify(dataArray));

            //Check if subscription is TRUE for the backtestId
            if (subscribed[backtestId]) {
                // Check if connection is OPEN
                if (res.readyState === WebSocket.OPEN) {
                    res.send(JSON.stringify({data:dataArray, backtestId: backtestId}));
                } else {
                    console.log("WebSocket is closed");
                    subscribed[backtestId] = false;
                }
            }
        }
    }
}

// Save backtest data to databse
function updateBacktestResult(backtestId, data) {
    console.log("Updating Backtest");
    BacktestModel.updateBacktest({
        _id: backtestId
    }, data);
}

// Find free Julia server
function findFreeServer() {
    for(var conn in isBusy) {
        if (isBusy.hasOwnProperty(conn) && !isBusy[conn]) {
            isBusy[conn] = true;
            return conn;
        }
    }
    // Oh no, none of the servers are free
    return null;
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

    return arr.shift();
}

module.exports = {
    handleSubscription,
    handleUnsubscription,
    handleBacktest
}
