'use strict';
const ws = require('../index').ws;
const schedule = require('node-schedule');
const jwtUtil = require('../utils/jwttoken');
const redisUtils = require('../utils/RedisUtils');
const BacktestController = require('./btControl.js');
const ForwardTestController = require('./ftControl.js');

// Listen to requests from UI
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
            // 3. exec-forwardtest
            // 4. stop-forwardtest
            console.log(msg);
            handleAction(msg, res);
        });
    });
});

function handleAction(msg, res) {
    if(msg.action === 'subscribe-backtest') {
        BacktestController.handleExecSubscription(msg, res);
    }
    else if(msg.action === 'unsubscribe-backtest') {
        BacktestController.handleExecUnsubscription(msg);
    }
    else if(msg.action === 'exec-backtest') {
        /* Here's the strategy for scheduling backtests:
            There is a backtest trigger function namely handleExecBacktest() whose core purpose is the following
            1. Obtain the first backtest from the head of redis queue
            2. If there is a free server then pass this backtest for processing to the server
            This trigger function proceses a backtest iff a free server is available
                and there are pending requests in the queue

            Now this trigger function handleExecBacktest() will have to be called in two scenarios:
            1. When a new backtest request is created by the UI
            2. Otherwise when a server finsihes a running backtest and is ready to accept another one

            Next what we do is:
            1. As soon as a new request is created by the UI,
                put it in the redis queue and trigger the handleExecBacktest() function
            2. If there is a free server available, then pass the backtest to it for processing
                Otherwise, if not, handleExecBacktest() will be triggered again when a backtest run
                is completed by the server.
                In which case, this backtest request will be passed for processing
        */
        let commonQueue;
        redisUtils.getValue('common-request-queue', function (err, data) {
            if(err || !data) {
                commonQueue = [];
            }
            else {
                commonQueue = JSON.parse(data);
            }

            // Push the latest backtest to the end of queue
            commonQueue.push(msg);
            redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));

            BacktestController.handleExecBacktest(null, res);
        });
    }
    else if(msg.action === 'exec-forwardtest') {

        /* Here's the strategy for running scheduled forward tests:
            Whenever a user puts in a request new forward test
            we will push a request in a separate redis queue, containing all the forward tests.
            Now, at 12 o'clock everyday, all the forward tests in the redis queue will be processed 1-by-1
            The deserialized data (alongwith other info) will be passed as paramaters to the test
            and when Julia returns the output, it will be saved to db.
        */

        let forwardQueue;
        redisUtils.getValue('forward-request-queue', function (err, data) {
            if(err || !data) {
                forwardQueue = {};
            }
            else {
                forwardQueue = JSON.parse(data);
            }

            // Foward queue is a dictionary
            // To help locate the exact forward test using forwardtestId
            // Because that will be needed if we want to stop a particular forward test
            forwardQueue[msg.forwardtestId] = msg;
            redisUtils.insertKeyValue('forward-request-queue', JSON.stringify(forwardQueue));
        });
    }
    else if(msg.action === 'stop-forwardtest') {
        let forwardQueue;
        redisUtils.getValue('forward-request-queue', function (err, data) {
            if(err || !data) {
                forwardQueue = {};
            }
            else {
                forwardQueue = JSON.parse(data);
            }

            delete forwardQueue[msg.forwardtestId];
            redisUtils.insertKeyValue('forward-request-queue', JSON.stringify(forwardQueue));
        });
    }
}

// Schedule all the forward test jobs
// The following code will be executed at 0000 hours everyday
schedule.scheduleJob("0 0 * * *", function() {
    // Load all the forward tests from redis into forwardQueue
    let forwardQueue;
    redisUtils.getValue('forward-request-queue', function(err, data) {
        if(err || !data) {
            forwardQueue = {};
        }
        else {
            forwardQueue = JSON.parse(data);
        }
    });

    // Now, one-by-one, process each of the forward test
    if(forwardQueue) {
        // Get all the jobs
        let jobs = Object.keys(forwardQueue).map(function(key) {
            return forwardQueue[key];
        });
        // Start executing jobs starting from job number 0 upto the number of jobs - 1
        ForwardTestController.handleExecForwardTest(0, jobs);
    }
});
