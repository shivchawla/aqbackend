'use strict';
const ws = require('../index').ws;
const jwtUtil = require('../utils/jwttoken');
const redisUtils = require('../utils/RedisUtils');
const BacktestController = require('./btControl.js');
const ForwardTestController = require('./ftControl.js');

// Listen to requests from UI
ws.on('connection', function connection(res) {
    res.on('message', function(message) {
        let req;

        try {
            req = JSON.parse(message);
        } catch (e) {
            return res.send('not valid json');
        }

        if (!req || !req['aimsquant-token']) {
            return res.send({
                'aimsquant-token': '',
                action: 'exec-backtest',
                backtestId: 'afd'
            });
        }

        jwtUtil.verifyToken(req['aimsquant-token'])
        .then(decoded => {
            if (decoded.exp <= Date.now()) {
                res.send('token expired');
                return;
            }

            // Call function based on action type
            // Action Types:
            // 1. exec-backtest
            // 2. subscribe-backtest
            // 3. run-all-forwardtest
            // 4. run-forwardtest
            // 5. stop-forwardtest
            handleAction(req, res);
        });
    });
});

function handleAction(req, res) {
    if(req.action === 'subscribe-backtest') {
        BacktestController.handleSubscription(req, res);
    }
    else if(req.action === 'unsubscribe-backtest') {
        BacktestController.handleUnsubscription(req);
    }
    else if(req.action === 'exec-backtest') {
        BacktestController.handleBacktest(req, res);
    }
    else if(req.action === 'run-all-forwardtest') {
        ForwardTestController.runAllForwardTest();
    }
    else if(req.action === 'run-forwardtest') {
        ForwardTestController.runForwardTest(req.forwardtestId);
    }
    else if(req.action === 'stop-forwardtest') {
        ForwardTestController.cancelTest(req.forwardtestId);
    }
}
