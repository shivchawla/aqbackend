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
            console.error("Token missing");
            return;
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
            exports.handleAction(req, res);
        });
    });
});

exports.handleAction = function(req, res) {
    if(req.action === 'subscribe-backtest') {
        return BacktestController.handleSubscription(req, res);
    }
    else if(req.action === 'unsubscribe-backtest') {
        return BacktestController.handleUnsubscription(req);
    }
    else if(req.action === 'exec-backtest') {
        return BacktestController.handleBacktest(req, res);
    }
    else if(req.action === 'run-all-forwardtest') {
        return ForwardTestController.runAllForwardTest();
    }
    else if(req.action === 'run-forwardtest') {
        return ForwardTestController.runForwardTest(req.forwardtestId);
    }
    else if(req.action === 'stop-forwardtest') {
        return ForwardTestController.cancelTest(req.forwardtestId);
    }
};
