'use strict';
require('../utils/spawn');
const ForwardtestModel = require('../models/Research/forwardtest');
const BacktestModel = require('../models/Research/backtest');
var CryptoJS = require("crypto-js");
const config = require('config');

exports.createForwardtest = function(args, res, next) {

    const userId = args.user._id;

    const backtestId = args.body.value.backtestId;
    const strategyId = args.body.value.strategyId;

    BacktestModel.fetchBacktest({_id: backtestId}, {})
    .then(backtest => {
        if (backtest) {
            if(backtest.strategy._id.equals(strategyId) && backtest.strategy.user.equals(userId)) {
                const forwardtest = {
                    strategy: strategyId,
                    backtest: backtestId,
                    settings: backtest.settings,
                    code: backtest.code,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    active: true,
                    error:false
                }; 
                return ForwardtestModel.saveForwardTest(forwardtest);
            } else {
                throw new Error("User Not authorized");
            }
        } else {
            throw new Error("Backtest not found");
        }
    })
    .then(ft => {
        return res.status(200).json(ft);
    })
    .catch(err => {
        return res.status(400).send(err.message);
    });
};

exports.getForwardTests = function(args, res, next) {

    const userId = args.user._id;
    const strategyId = args.strategyId.value;
    const fetchDeleted = false;

    const options = {};
    options.skip = args.skip.value;
    options.limit = args.limit.value;

    options.sort = args.sort.value;
    options.select = args.select.value;

    StrategyModel.fetchStrategy({user:userId, _id: strategyId}, {select:'user'})
    .then(strategy => {
        if(strategy) {
            return ForwardTestModel.fetchForwardTests({
                strategy: strategy._id,
                deleted: false}, options)
        } else {
            return new Error("Not Authorized");
        }
    })
    .then(forwardtests => {
        for(var i=0; i<forwardtests.length; i++){
            forwardtests[i].code = CryptoJS.AES.decrypt(forwardtests[i].code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        }
        res.status(200).json(forwardtests);
    })
    .catch(err => {
        next(err);
    });
};

exports.getForwardTest = function(args, res, next) {
    const forwardtestId = args.forwardtestId.value;
    const userId = args.user._id;

    const options = {};
    options.select = args.select.value;

    if (options.select) {
        if (options.select.indexOf('strategy') == -1) {
            options.select.append(' strategy');
        }
    }

    ForwardtestModel.fetchForwardTest({
        _id: forwardtestId, deleted: false
    }, options)
    .then(ft => {
        if(ft) {
            if(ft.strategy.user.equals(userId)) {
                ft.code = CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
                return res.status(200).json(ft);
            } else {
                throw new Error("forwardtestId doesn't exist for the user");
            }
        } else {
            throw new Error("No forwardtest found");
        }
    })
    .catch(err => {
        return res.status(400).send(err.message);
    });
};

//How to make this linear and NOT nested
exports.deleteForwardTest = function(args, res, next) {
    const forwardtestId = args.forwardtestId.value;
    const userId = args.user._id;

    ForwardtestModel.fetchForwardTest({_id:forwardtestId}, {})
    .then(forwardtest => {
        if(forwardtest && forwardtest.strategy.user.equals(userId)) {
            ForwardtestModel.updateForwardTest({_id: forwardtestId}, {deleted : true})
        } else {
            throw new Error("User is not authorized");
        }
    })
    .then(obj => {
        res.status(200).json({forwardtestId: forwardtestId, message:"Successfly deleted"});
    })
    .catch(err=>{
        return res.status(400).send(err.message);
        next(err);
    });
};

exports.updateForwardTest = function(args, res, next) {
    
    const forwardtestId = args.forwardtestId.value;
    const userId = args.user._id;

    const updates = {};

    if(args.active) {
        updates.active = args.active.value;    
    }

    ForwardtestModel.fetchForwardTest({_id:forwardtestId}, {})
    .then(forwardtest => {
        if(forwardtest && forwardtest.strategy.user.equals(userId)) {
            return ForwardtestModel.updateForwardTest({_id: forwardtestId}, updates);
        } else {
            throw new Error("User is not authorized");
        }
    })
    .then(obj => {
        if(obj) {
            return res.status(200).json(obj);
        }
    })
    .catch(err => {
        return res.status(400).send(err.message);
        next(err);
    });

};
