'use strict';
const ws = require('../index').ws;
const jwtUtil = require('../utils/jwttoken');
const redisUtils = require('../utils/RedisUtils');
const StrategyModel = require('../models/strategy');
const BacktestModel = require('../models/backtest');
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
            // 3. run-all-forwardtest
            // 4. run-forwardtest
            // 5. stop-forwardtest
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

        BacktestModel.fetchBacktest({
            _id: msg.backtestId
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

                // Append epoch time to the msg (measure for time of request)
                msg.time = (new Date()).getTime();
                // userId of the requesting user
                msg.userId = st.user._id;
                // What if the dates are re-specified in the code and not as settings?
                msg.date_range = new Date(bt.settings.endDate) - new Date(bt.settings.startDate);

                // These details were appended to the corresponding backtest request for the priority function

                console.log("Starting Backtest...");

                // Save the backtest request to redis

                BacktestController.saveToRedis(msg, res);

            })
            .catch(err => {
                return console.error("Error occured: " + err);
            });
        })
        .catch(err => {
            return console.error("Error occured: " + err);
        });
    }
    else if(msg.action === 'run-all-forwardtest') {
        ForwardTestController.runAllForwardTest();
    }
    else if(msg.action === 'run-forwardtest') {
        ForwardTestController.runForwardTest(msg.forwardtestId);
    }
    else if(msg.action === 'stop-forwardtest') {
        ForwardTestController.cancelTest(msg);
    }
}
