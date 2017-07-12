'use strict';
const spawn = require('child_process').spawn;
const StreamSplitter = require('stream-splitter');
const ws = require('../index').ws;
const jwtUtil = require('../utils/jwttoken');
const redisUtils = require('../utils/RedisUtils');
const BacktestModel = require('../models/backtest');
const ForwardTestModel = require('../models/forwardtest');
const StrategyModel = require('../models/strategy');
var CryptoJS = require("crypto-js");
const config = require('config');
const WebSocket = require('ws');
var schedule = require('node-schedule');

var isopen = {};

// Initialize map for status of each connection
// Our Julia server can only accept one connection per process
for(var machine of config.get('machines')) {
    var conn = 'ws://' + machine.host + ":" + machine.port;
    isopen[conn] = false
}

// Connection for forward tests
// Will have to add forward testing server details (host:port) in the config file
var ftConnection = 'ws://' + fmachine.host + ":" + fmachine.port;

var outputData   = {};
var forwardTestOutputData = {};
var subscribed   = {};

ws.on('connection', function connection(res) {
    res.on('message', function(message) {
        let msg;

        try {
            msg = JSON.parse(message);
        } catch (e) {
            return res.send('not valid json');
        }

        if (!msg || !msg['aimsquant-token']) {
            return res.send({
                'aimsquant-token': '',
                action: 'exec-backtest',
                backtestId: 'afd'
            });
        }

        jwtUtil.verifyToken(msg['aimsquant-token'])
        .then(decoded => {
            if (decoded.exp <= Date.now()) {
                res.send('token expired');
                return;
            }

            // Call function based on action type
            // Action Types:
            // 1. exec-backtest
            // 2. subscribe-backtest
            console.log(msg);
            handleAction(msg, res);

        });
    });
});

function handleAction(msg, res) {
    if(msg.action === 'subscribe-backtest') {
        handleExecSubscription(msg, res);
    } else if(msg.action === 'exec-backtest') {

        let userQueue;
        let commonQueue;

        redisUtils.getValue('common-request-queue', function (err, data) {
        //redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
            if (err || !data) {
                //var stringfiedMessage = JSON.stringify([{data:msg, in_process:true}]);
                commonQueue = [];
                redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));//stringfiedMessage );
                //handleExecBacktest(msg, res);
            } else {
                commonQueue = JSON.parse(data);
            }

            redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                if (err || !data) {
                    userQueue = [];
                    redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(userQueue));
                } else {
                    userQueue = JSON.parse(data);
                }

                let commonQueueMsg;
                let userQueueMsg = msg;
                if(commonQueue.length < config.get('max_num_julia_process_total')){
                    commonQueueMsg = {data:msg, in_process:true};

                    //update both the queues
                    commonQueue.push(commonQueueMsg);
                    userQueue.push(userQueueMsg);

                    // Execute the backtest
                    handleExecBacktest(msg, res);

                } else {
                    console.log("Queueing request");
                    commonQueueMsg = {data:msg, in_process:false};
                    commonQueue.push(commonQueueMsg);
                    userQueue.push(userQueueMsg);
                }


                redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));
                redisUtils.insertKeyValue(msg['aimsquant-token'] +'-request-queue', JSON.stringify(userQueue));

            });

        });

    } else if(msg.action === 'exec-forwardtest') {

        /* Here's the strategy for running scheduled forward tests:
            Whenever a user puts in a request new forward test
            we will push a request in a separate redis queue, containing all the forward tests.
            Now, at 12 o'clock everyday, all the forward tests in the redis queue will be processed 1-by-1
            The deserialized data (alongwith other info) will be passed as paramaters to the test
            and when Julia returns the output, it will be saved to db.
        */

        let forwardQueue;
        redisUtils.getValue('forward-request-queue', function (err, data) {
            if(err || !data)
                forwardQueue = {};
            else
                forwardQueue = JSON.parse(data);

            forwardQueue[msg.forwardtestId] = msg;
            redisUtils.insertKeyValue('forward-request-queue', JSON.stringify(forwardQueue));
        });

    } else if(msg.action === 'stop-forwardtest') {
        let forwardQueue;
        redisUtils.getValue('forward-request-queue', function (err, data) {
            delete forwardQueue[msg.forwardtestId];
            redisUtils.insertKeyValue('forward-request-queue', JSON.stringify(forwardQueue));
        });
    }
}

/*=====================================
        SUBSCRIPTION CONTROL
=====================================*/

//Function to subscribe WS data from backend to UI
function handleExecSubscription(msg, res) {
    var backtestId = msg.backtestId;
    //Call send data
    //Send data automaticaly stops or reject the call ig backtest has completed
    subscribed[backtestId] = true;
    sendData(res, backtestId);
}

//Function to unsubscribe WS data from backend to UI
function handleExecUnsubscription(msg, res) {
    var backtestId = msg.backtestId;
    //Call send data
    //Send data automaticaly stops or reject the call ig backtest has completed
    subscribed[backtestId] = false;
}

/*=====================================
        BACKTEST CONTROL
=====================================*/

//Function to handle the execution of backtests.
//Pass comandline arguments to free Julia process
//Collect the output, send realtime updates and save the final output to the DB
function handleExecBacktest(msg, res) {
    if (msg.action === 'exec-backtest') {
        return execBacktest(msg, res, (err, updateData) => {
            var status = updateData.status;

            if(err) {
                res.send(JSON.stringify({backtestId:msg.backtestId, outputtype:"log", message:"Internal Exception", messagetype:"ERROR"}));
            } else {
                if(status == 'exception') {
                    res.send(JSON.stringify({backtestId:msg.backtestId, outputtype:"log", message:"Internal Exception", messagetype:"ERROR"}));

                } else if(status != "pending") {
                    // Send the complete data one last time && delete the data from variable
                    sendData(res, msg.backtestId);
                }
            }

            updateBacktestResult(updateData, msg);

            // Set expiry for data in redis - 10s
            console.log("Setting Expiry");
            redisUtils.setDataExpiry(msg.backtestId + '-data', 10);

            //Remove backtestId key from outputData
            delete outputData[msg.backtestId];

            processNext(msg);

        });
    } else if (message === 'rl_close') {
        return res.send('Not implemented');
    }
}

function execBacktest(msg, res, cb) {

    var backtestId = msg.backtestId;
    let child = '';
    let splitter = '';
    let backtestData = '';

    console.log('execBacktest is called too');

    BacktestModel.fetchBacktest({
        _id: backtestId
    }, {})
    .then(bt => {
        var args = [];

        if(!bt){
            throw "InValid Backtest";
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
        let wsClient;
        let conn;
        let backtestData = '';
        var backtestId = msg.backtestId;

        outputData[backtestId] = [];

        var isconnected = false;

        for (var connection in isopen){
            if (!isopen[connection]) {
                conn = connection;
                wsClient = new WebSocket(connection);
                isconnected = true;
                break;
            }
        }

        if (!isconnected) {
            return cb(null, {status:"pending"})
        }

        wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(conn);
            isopen[conn] = true;

            wsClient.send(argArray.join("??##"));

            subscribed[msg.backtestId] = true;

            redisUtils.insertKeyValue(msg.backtestId + '-data', JSON.stringify(outputData[backtestId]));

            setTimeout(function(){sendData(res, msg.backtestId);},
                    config.get('time_interval_realtime_output'));

        });

        wsClient.on('message', function(data) {
            // CHECK DATA: IF REQUEST WAS REJECTED, TRY WITH ANOTHER JULIA PROCESS
            // Handled by checking the pendng status
            var backtestId = msg.backtestId;

            try {
                const dataJSON = JSON.parse(data);
                dataJSON.backtestId = backtestId;

                if (dataJSON.outputtype === 'backtest') {
                    backtestData = dataJSON;

                } else {
                    outputData[backtestId].push(dataJSON);
                }

            } catch (e) {
                console.log(e);
            }
        });

        wsClient.on('close', function close(code) {
            console.log('Connection Closed');
            console.log(conn);
            isopen[conn] = false;

            // Update the connection status
            if (code === 1000) {
                try {
                    // If success and no data was generated => PENDING
                    if(backtestData && Object.keys(backtestData).length > 0) {
                        cb(null, {output: backtestData, status:"complete"});
                    } else {
                        cb(null, {status:"exception"});
                    }
                } catch (e) {
                    cb(e, {status:"exception"});
                }
            }
        });

    })
    .catch(err => {
        cb(err, {status:"exception"});
    });
}

// SEND BACKTESTS STATISTICS TO FRONT-END

function sendData(res, backtestId) {

    var dataArray = outputData[backtestId];

    if (dataArray) {
        if(dataArray.length) {
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

        setTimeout(function(){sendData(res, backtestId);},
            config.get('time_interval_realtime_output'));
    }
}

// SAVE BACKTEST DATA TO DATABSE

function updateBacktestResult(data, msg) {
    console.log("Updating Backtest");
    BacktestModel.updateBacktest({
        _id: msg.backtestId
    }, data);
}

// PROCESS NEXT REQUESTS IN REDIS

function processNext(msg) {
    redisUtils.getValue('common-request-queue', function (err, data) {

        let commonQueue;
        let userQueue;
        if (data) {
            commonQueue = JSON.parse(data);
        }

        // now get user specific queue
        redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
            if (data) {
                userQueue = JSON.parse(data);
            }

            // find the backtestId in the commonQueue
            var commonQueueIdx = commonQueue.map(x => x.data.backtestId).indexOf(msg.backtestId);
            let commonQueueMsg;

            if(commonQueueIdx !=-1 ) {
                commonQueueMsg = commonQueue[commonQueueIdx]
            }

            var userQueueIdx = userQueue.map(x=>x.backtestId).indexOf(msg.backtestId);
            let userQueueMsg;

            if(userQueueIdx != -1) {
                userQueueMsg = userQueue[userQueueIdx];
            }

            if (commonQueueMsg && userQueueMsg) {
                // If request was not completed, update in-process to FALSE
                if(status == 'pending') {
                    commonQueue[commonQueueIdx].in_process = false;
                } else {
                    // If request was completed (successfuly or with error)
                    // dequeue the request
                    commonQueue.splice(commonQueueIdx, 1);
                    userQueue.splice(userQueueIdx, 1)
                }

                // Now find pending request in common queue
                for(var i=0; i<commonQueue.length; i++){
                    if(commonQueue[i].in_process === false) {
                        handleAction(commonQueue[i].data, res);
                        commonQueue[i].in_process === true;
                        break;
                    }
                }

                // TODO: Add logic to transfer request from user to common queue.
                // With this logic, a user can add mutliple request and not JAM the
                // coomon request queue if user request exceed the size

            } else {
                console.log("This is a problem. This should never happen");
            }

            redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));
            redisUtils.insertKeyValue(msg['aimsquant-token']+'-request-queue', JSON.stringify(userQueue));

        });

    });
}

/*=====================================
        FORWARD TEST CONTROL
=====================================*/

// Handle execution of forward tests
// The following code will be executed at 0000 hours everyday
var job = schedule.scheduleJob("0 0 * * *", function() {
    // Load all the forward tests from redis into forwardQueue
    let forwardQueue;
    redisUtils.getValue('forward-request-queue', function(err, data) {
        if(err || !data)
            forwardQueue = {};
        else
            forwardQueue = JSON.parse(data);
    });

    // Now, one-by-one, process each of the forward test
    if(forwardQueue) {
        jobs = Object.keys(forwardQueue).map(function(key) {
            return forwardQueue[key];
        });
        handleExecForwardTest(0, jobs);
    }
});

// Forward test handler for running each forward test synchronously
function handleExecForwardTest(counter, jobs) {
    if(counter >= jobs.length)
        return;
    else {
        currentJob = jobs[counter];
        execForwardTest(currentJob, function(err) {
            if(err) {
                console.log("Error Occured:");
                console.error(err);
            }
            else
                handleExecForwardTest(counter+1, jobs);
        });
    }
}

// Forward test executer
// Will start running a forward test on the Julia server
function execForwardTest(msg, cb) {
    console.log('execForwardTest is called');

    ForwardTestModel.fetchForwardTest({
        _id: msg.forwardtestId
    }, {})
    .then(ft => {
        var args = [];

        if(!ft){
            throw "Invalid Forward Test";
        }

        args = args.concat(['--code', CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

        // If there is serialized data available then pass it as command line arg
        // Otherwise it's a fresh start
        if(ft.output) {
            args = args.concat(['--data', ft.output]);
        }
        else {
            var settings = ft.settings;
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

        var forwardtestId = msg.forwardtestId;
        forwardTestOutputData[forwardtestId] = [];
        ftClient = new WebSocket(ftConnection);

        ftClient.on('open', function() {
            console.log('Connection Open');
            ftClient.send(argArray.join("??##"));
        });

        ftClient.on('message', function(data) {
            try {
                const dataJSON = JSON.parse(data);
                forwardTestOutputData[forwardtestId].push(dataJSON);
            } catch (e) {
                console.log(e);
            }
        });

        ftClient.on('close', function close(code) {
            console.log('Connection Closed');

            // Update the connection status
            if (code === 1000) {
                updateForwardTestResult({output: forwardTestOutputData[forwardtestId]}, msg);
                cb();
            }
            else {
                cb("Test could not be completed");
            }
        });

    })
    .catch(err => {
        cb(err);
    });
}

// UPDATE FORWARD TEST SERIALIZED OUTPUT TO DATABASE

function updateForwardTestResult(data, msg) {
    console.log("Updating Forward Test");
    ForwardTestModel.updateForwardTest({
        _id: msg.forwardtestId
    }, data);
}
