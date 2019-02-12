'use strict';
const BacktestModel = require('../../models/Research/backtest');
const StrategyModel = require('../../models/Research/strategy');
var CryptoJS = require("crypto-js");
const config = require('config');
const spawn = require('../Realtime/spawn');
const _ = require('lodash');

exports.createBacktest = function(strategy, settings, res, next) {
    const backtest = {
        strategy: strategy._id,
        settings: settings,
        code: strategy.code,
        entryConditions: strategy.entryConditions,
        exitConditions: strategy.exitConditions,
        entryLogic:strategy.entryLogic,
        exitLogic:strategy.entryLogic,
        name: strategy.name,
        strategy_name: strategy.name,
        status : 'active',
        createdAt : new Date(),
        shared:false,
        deleted:false,
    };

    return BacktestModel.saveBacktest(backtest)
    .then(bt => {
        if(bt) {
            var req = {action:'exec-backtest', backtestId: bt._id};
            try {
                return spawn.handleAction(req, null)
                .then(() =>{
                    return bt;
                })
            } catch(err) {
                console.log(err);
            }
        } 
    })
    .then(bt => {
        return res.status(200).json(bt);
    })
    .catch(err => {
        return res.status(400).send(err.message);
    });
};

exports.getBackTests = function(args, res, next) {
    
    const userId = args.user._id;
    const strategyId = args.strategyId.value;
    const fetchDeleted = false;

    const options = {};
    options.skip = args.skip.value;
    options.limit = args.limit.value;

    options.sort = args.sort.value;
    options.select = args.select.value;

    return StrategyModel.fetchStrategy({user:userId, _id: strategyId}, {select:'user'})
    .then(strategy => {
        if(strategy) {
            return BacktestModel.fetchBacktests({
                strategy: strategy._id,
                deleted: false}, options)
        } else {
            return new Error("Not Authorized");
        }
    })
    .then(backtests => {
        for(var i=0; i<backtests.length; i++){
            backtests[i].code = CryptoJS.AES.decrypt(backtests[i].code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        }
        return res.status(200).json(backtests);
    })
    .catch(err => {
        next(err);
    });
};

exports.getBackTest = function(args, res, next) {
    const backtestId = args.backtestId.value;
    const userId = args.user._id;

    const options = {};
    options.select = args.select.value;

    if (options.select) {
        options.select = options.select.concat(' strategy');
    }

    return BacktestModel.fetchBacktest({
        _id: backtestId,
    }, options)
    .then(bt => {
        if(bt) {
            if(bt.code) {
                if(bt.shared || bt.strategy.user.toString() == userId.toString()) {
                    bt.code = CryptoJS.AES.decrypt(bt.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
                } 
            } 
            
            return res.status(200).json(bt);
        } else {
            throw new Error("No Backtest Found");
        }
    })
    .catch(err => {
        next(err);
    });
};

//How to make this linear and NOT nested
exports.deleteBackTest = function(args, res, next) {
    const backtestId = args.backtestId.value;
    const userId = args.user._id;

    return BacktestModel.fetchBacktest({_id : backtestId, shared : true}, {})
    .then(backtest => {
        if(backtest && backtest.strategy.user.toString() == userId){
            return BacktestModel.updateBacktest({_id: backtestId}, {deleted : true})
            .then(obj => {
                return res.status(200).json({backtestId: backtestId, message:"Successfly deleted"});
            })
            .catch(err => {
                next(err);
            });
        } else {
            return BacktestModel.removeAllBack({
                _id: backtestId,
                shared:false
            })
            .then(obj => {
                return res.status(200).json({backtestId: backtestId, message:"Successfly deleted"});
            })
            .catch(err => {
                next(err);
            });
        }
    })
    .catch(err=>{
        next(err);
    });
};

exports.updateBacktest = function(args, res, next) {
    const backtestId = args.backtestId.value;
    const userId = args.user._id;

    const updates = {};
    
    if(args.name.value) {
        updates.name = args.name.value;
    }

    if(args.notes.value) {
        updates.notes = args.notes.value;
    }

    return BacktestModel.updateBacktest({user: userId, _id: backtestId}, updates)
    .then(obj => {
        if(obj) {
            return res.status(200).json(obj);
        }
    })
    .catch(err=>{
        next(err);
    });
};




