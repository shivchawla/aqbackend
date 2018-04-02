'use strict';
const ws = require('../../index').ws;
const jwtUtil = require('../../utils/jwttoken');
const redisUtils = require('../../utils/RedisUtils');
const BacktestController = require('./btControl.js');
const ForwardTestController = require('./ftControl.js');
const MarketPlaceController = require('./mktControl.js');
const UserModel = require('../../models/user');
const APIError = require('../../utils/error');
const Promise = require('bluebird');

// Listen to requests from UI
ws.on('connection', function connection(res) {
    res.on('message', function(message) {
        let req;

        Promise.resolve()
        .then(x => {
            if (!req || !req['aimsquant-token']) {
                APIError.message({message: "Token missing"});
            }
        
            req = JSON.parse(message);
            return req;
        })
        .then(req => {
            return jwtUtil.verifyToken(req['aimsquant-token'])
        })
        .then(decoded => {
            if (decoded.exp*1000 <= Date.now()) {
                APIError.throwJSONError({message: "Token expired"});
            } else {
                return UserModel.fetchUser({_id: decoded._id});
            }

            // Call function based on action type
            // Action Types:
            // 1. exec-backtest
            // 2. subscribe-backtest
            // 3. run-all-forwardtest
            // 4. run-forwardtest
            // 5. stop-forwardtest
            
        })
        .then(user => {
            if (user) {
                req.userId = user._id;
                exports.handleAction(req, res);
            } else {
                APIError.throwJSONError({message: "User is not Authorized"});
            }
        })
        .catch(err => {
            res.send(err.message);
        });
    });
});

exports.handleAction = function(req, res) {
    if(req.action === 'subscribe-backtest') {
        return BacktestController.handleSubscription(req, res);
    }
    else if (req.action === 'subscribe-fresh-backtest'){
        return BacktestController.handleSubscription(req, res, true);   
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
    else if(req.action === 'subscribe-mktplace') {
        return MarketPlaceRtController.handleMktPlaceSubscription(req, res);
    }
};
