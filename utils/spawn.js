'use strict';
const ws = require('../index').ws;
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

        handleAction(msg, res);

        /*if (!msg || !msg['aimsquant-token']) {
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
        });*/
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
    else if(msg.action === 'run-all-forwardtest') {
        ForwardTestController.runAllForwardTest();
    }
    else if(msg.action === 'run-forwardtest') {
        ForwardTestController.runForwardTest(msg);
    }
    else if(msg.action === 'stop-forwardtest') {
        ForwardTestController.cancelTest(msg);
    }
}
