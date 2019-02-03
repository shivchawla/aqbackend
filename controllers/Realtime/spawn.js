'use strict';
const ws = require('../../index').ws;
const jwtUtil = require('../../utils/jwttoken');
const BacktestController = require('./btControl.js');
const ForwardTestController = require('./ftControl.js');

const MarketDataController = require('./marketDataControl.js');
const MarketPlaceController = require('./mktPlaceControl.js');
const PredictionController = require('./predictionControl.js');

const UserModel = require('../../models/user');
const APIError = require('../../utils/error');
const Promise = require('bluebird');

// Listen to requests from UI
ws.on('connection', function connection(res) {
    res.on('message', function(message) {
        let req;

        try {
            req = JSON.parse(message);
        } catch (e) {
            return res.send('Not a Valid Json message');
        }
       
        Promise.resolve()
        .then(x => {
            if (!req || !req['aimsquant-token']) {
                APIError.throwJsonError({message: "Token missing"});
            }
        
            req = JSON.parse(message);
            return req;
        })
        .then(req => {
            return jwtUtil.verifyToken(req['aimsquant-token'])
        })
        .then(decoded => {
            if (decoded.exp*1000 <= Date.now()) {
                APIError.throwJsonError({message: "Token expired"});
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
                return exports.handleAction(req, res);
            } else {
                APIError.throwJsonError({message: "User is not Authorized"});
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
        return ForwardTestController.runAllForwardTests();
    }
    else if(req.action === 'run-forwardtest') {
        return ForwardTestController.runForwardTest(req.forwardtestId);
    }
    else if(req.action === 'stop-forwardtest') {
        return ForwardTestController.cancelTest(req.forwardtestId);
    } 
    else if(req.action === 'subscribe-mktplace') {
        return MarketPlaceController.handleMktPlaceSubscription(req, res);
    }
    else if(req.action === 'unsubscribe-mktplace') {
        return MarketPlaceController.handleMktPlaceUnsubscription(req, res);
    }
    else if(req.action === 'subscribe-prediction') {
        return PredictionController.handlePredictionSubscription(req, res);
    }
    else if(req.action === 'unsubscribe-prediction') {
        return PredictionController.handlePredictionUnSubscription(req, res);
    }
};
