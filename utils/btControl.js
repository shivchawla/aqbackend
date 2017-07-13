'use strict';
const redisUtils = require('../utils/RedisUtils');
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const BacktestModel = require('../models/backtest');

var isBusy = {};

// Initialize map for status of each connection
// Our Julia server can only accept one connection per process
for(var machine of config.get('machines')) {
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
    var status, data;
    var backtestId = msg.backtestId;
    BacktestModel.fetchBacktest({
        _id: backtestId
    }, {})
    .then(bt => {
        if(!bt) {
            throw new Error("Backtest not found");
        }
        status = bt.status;
        data   = bt.output;
    })
    .catch(err => {
        console.error(err);
    });

    if(status === "completed") {
        // Backtest was already completed
        res.send(JSON.stringify(data));
    }
    else {
        // Backtest is till running or will run after some time
        subscribed[backtestId] = true;
    }
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

//Function to handle the execution of backtests.
//Pass comandline arguments to free Julia process
//Collect the output, send realtime updates and save the final output to the DB
function handleExecBacktest(connection, res) {
    // First retrieve all the backtests
    var commonQueue;
    redisUtils.getValue('common-request-queue', function (err, data) {
        if(err || !data) {
            commonQueue = [];
        }
        else {
            commonQueue = JSON.parse(data);
        }
    });

    if(commonQueue.length > 0) {
        // There are pending backtests in queue and
        let server;
        if(!connection) {
            server = findFreeServer();
            if(!server) {
                // No free server available
                return;
            }
        }
        else {
            server = connection;
        }

        // Pull off the first backtest job from the head of queue
        let msg = commonQueue.shift();
        // Update redis queue because a backtest has been popped out and sent for processing
        redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));

        // And deploy the backtest
        execBacktest(msg, server, res, function(err, conn, data) {
            // Callback function
            // This is called when one of the servers finish processing a backtest
            // and is ready to accept another backtest
            if(err||data.status === "exception") {
                // This particular backtest couldn't be completed
                // Error logs
                console.error("Error Occured:");
                console.error(err);

                // Let's put it's status to pending
                updateBacktestResult({status: "pending"}, msg);

                // And let's process this failed backtest again from the beginning
                commonQueue.push(msg);
                redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));
            }
            else {
                // Backtest successfully completed
                // Update the db with output
                updateBacktestResult(data, msg);
            }
            // Start off with next backtest
            handleExecBacktest(conn, res);
        });
    }
    else {
        if(connection) {
            isBusy[connection] = false;
        }
    }
}

function execBacktest(conn, msg, res, cb) {

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

            var advanced = JSON.parse(settings.advanced);

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
            // CHECK DATA: IF REQUEST WAS REJECTED, TRY WITH ANOTHER JULIA PROCESS
            // Handled by checking the pendng status

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

    if (dataArray) {
        // if(dataArray.length) {
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
        // }
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
    for(var conn in Object.keys(isBusy)) {
        if(!isBusy[conn]) {
            isBusy[conn] = true;
            return conn;
        }
    }
    // Oh no, none of the servers are free
    return null;
}

module.exports = {
    handleExecSubscription,
    handleExecUnsubscription,
    handleExecBacktest
}
