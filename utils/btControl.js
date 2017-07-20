'use strict';
const redisUtils = require('../utils/RedisUtils');
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const BacktestModel = require('../models/backtest');

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

/* =====================================
        SUBSCRIPTION CONTROLLER
===================================== */

//Function to subscribe WS data from backend to UI
function handleExecSubscription(msg, res) {
    /* Two cases :
        1. Execution of backtest is going on/will be done
        2. Backtest was already completed long time back
    */
    var backtestId = msg.backtestId;
    BacktestModel.fetchBacktest({
        _id: backtestId
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
function handleExecUnsubscription(msg) {
    var backtestId = msg.backtestId;
    //Call send data
    //Send data automaticaly stops or reject the call if backtest has completed
    subscribed[backtestId] = false;
}

/* =====================================
        BACKTEST CONTROLLER
===================================== */

function saveToRedis(msg, res) {
    // backtest-request-queue contains key-value pairs
    // where each key is the backtestId pointing to the corresponding backtest request
    redisUtils.insertIntoRedis('backtest-request-queue', msg.backtestId, JSON.stringify(msg));

    // Now we handle the requests
    queueHandler(null, res);
}

function queueHandler(connection, res) {
    // For handling availability of servers and passing backtest requests for execution
    let server;
    if(!connection) {
        server = findFreeServer();
        if(!server) {
            // No free server available
            console.log("No available server at the moment");
            return;
        }
    }
    else {
        server = connection;
    }

    // Server is available
    // Let's retrieve everything from Redis

    redisUtils.getAllFromRedis('backtest-request-queue', function(err, data) {
        if(err) {
            isBusy[server] = false;
            console.error("Error: " + err);
            return;
        }
        if (!data) {
            // Redis is empty
            console.log("All backtests over!");
            isBusy[server] = false;
            return;
        }

        // Backtest requests queue
        let queue = Object.keys(data).map(function(x) {
            return JSON.parse(data[x]);
        });

        // Pop the top priority element from queue
        let msg = getNext(queue);

        // Reflect this change in the redis queue
        redisUtils.deleteFromRedis('backtest-request-queue', msg.backtestId, function(err, reply) {
            if (err) {
                return console.error(err);
            }

            // Send this backtest request for execution
            execBacktest(msg, server, res, function(err, conn, data) {
                // Callback function
                // This is called when one of the servers finish processing a backtest
                // and is ready to accept another backtest
                if(err) {
                    // This particular backtest couldn't be completed
                    console.error("Error Occured:");
                    console.error(err);

                    // Let's put it's status to pending
                    updateBacktestResult({status: "pending"}, msg);
                }
                else if(data.status === "exception") {
                    // Some error occured in the processing of backtest
                    // Or otherwise Julia returned an error
                    console.error("Exception in backtest occured");

                    // Let's put it's status to exception
                    updateBacktestResult({status: "exception"}, msg);
                }
                else {
                    // Backtest successfully completed
                    // Update the db with output
                    updateBacktestResult(data, msg);
                }
                // Start off with next backtest
                queueHandler(conn, res);
            });
        });
    });
}

function execBacktest(msg, conn, res, cb) {

    console.log('execBacktest is called');

    var backtestId = msg.backtestId;

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

        var btClient, backtestData = '', poll;

        outputData[backtestId] = [];

        btClient = new WebSocket(conn);

        btClient.on('open', function() {
            console.log('Connection Open');

            btClient.send(argArray.join("??##"));

            subscribed[backtestId] = true;

            redisUtils.insertKeyValue(msg.backtestId + '-data', JSON.stringify(outputData[backtestId]));

            poll = setInterval(function(){sendData(res, msg.backtestId);},
                    config.get('time_interval_realtime_output'));

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
            // Send data for one last time
            sendData(res, msg.backtestId);

            // Update the connection status
            if (code === 1000) {
                try {
                    if(backtestData && Object.keys(backtestData).length > 0) {
                        cb(null, conn, {output: backtestData, status:"complete"});
                    }
                    else {
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
            }
        }
    }
}

// Save backtest data to databse

function updateBacktestResult(data, msg) {
    console.log("Updating Backtest");
    BacktestModel.updateBacktest({
        _id: msg.backtestId
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

function getNext(arr) {
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
    // =================== Above algorithm is bad. O(n^2) :( ===================

    // 3. Sort on date range
    arr.sort(function(x, y) {
        return x.date_range - y.date_range;
        // Larger the date range, lower the priority
    });

    return arr.shift();
}

module.exports = {
    handleExecSubscription,
    handleExecUnsubscription,
    saveToRedis
}
