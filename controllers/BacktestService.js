'use strict';
require('../utils/spawn');
const BacktestModel = require('../models/backtest');
const Community_backtest = require('../models/community_backtest');
const StrategyModel = require('../models/strategy');
var CryptoJS = require("crypto-js");
const config = require('config');

exports.createBacktest = function(strategy, values, res, next) {
    const backtest = {
        strategy: strategy._id,
        settings: values, 
        code: strategy.code,
        name: strategy.name,
        strategy_name: strategy.name,
        status : 'active',
        createdAt : new Date(),
        shared:false,
        deleted:false,
    };
    return BacktestModel.saveBacktest(backtest)
    .then(backtst => {
        res.status(200).json(backtst);
    })
    .catch(err => {
        console.log(err);
        next(err);
    });
};

exports.getBackTests = function(args, res, next) {
    const skip = args.skip.value;
    const limit = args.limit.value;
    const user = args.user;
    const id = args.id.value;
    const fetchDeleted = false;
    StrategyModel.fetchStrategy({
        user: user._id,
        _id: id
    }, fetchDeleted)
    .then(strategy => {
        return BacktestModel.fetchBacktests({
            strategy: strategy._id,
            deleted:false,
        }, limit, skip);
    })
    .then(backtests => {
        for(var i=0; i<backtests.length; i++){
            backtests[i].code = CryptoJS.AES.decrypt(backtests[i].code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        }
        res.status(200).json(backtests);
    })
    .catch(err => {
        next(err);
    });
};

exports.getBackTest = function(args, res, next) {
    const id = args.id.value;
    BacktestModel.fetchBacktest({
        _id: id
    })
    .then(bt => {

        if(bt) {
            bt.code = CryptoJS.AES.decrypt(bt.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
            res.status(200).json(bt);
        } else {
            res.status(400).json({id:id, message:"BacktestId doesn't exist"});
        }
    })
    .catch(err => {
        next(err);
    });
};

exports.deleteBackTest = function(args, res, next) {
    const id = args.id.value;
    BacktestModel.fetchBacktest({_id : id, shared : true}).then((bacttestObj)=>{
        if(bacttestObj){
            BacktestModel.updateBacktestUpdated({_id: id},{deleted : true})
            .then(obj => {
                console.log("Soft delete")
                res.status(200).json({id: id});
            })
            .catch(err => {
                next(err);
            });
        }else{
            BacktestModel.removeAllBack({
                _id: id,
                shared:false
            })
            .then(obj => {
                console.log("Hard Delete")
                res.status(200).json({id: id});
            })
            .catch(err => {
                next(err);
            });
        }
    }).catch(err=>{
        next(err);
    })
    
};

exports.shareBackTest = function(args, res, next) {
    const id = args.id.value;
    BacktestModel.fetchBacktest({
        _id: id
    })
    .then(bt => {
        return StrategyModel.fetchStrategy({
            name: 'Community'
        })
        .then(strat => {
            const strategy = strat.toObject();
            const backTest = bt.toObject();
            delete backTest._id;
            backTest.strategy = strategy._id;
            return Community_backtest.saveBacktest(backTest);
        })
        .then(bacTe => {
            res.status(200).json(bacTe);
        });
    })
    .catch(err => {
        next(err);
    });
};

exports.getCommunityBackTest = function(args, res, next) {
    const skip = args.skip.value;
    const limit = args.limit.value;
    StrategyModel.fetchStrategy({
        name: 'Community'
    })
    .then(strat => {
        const strategy = strat.toObject();
        return BacktestModel.fetchBacktests({
            strategy: strategy._id
        }, limit, skip);
    })
    .then(data => {
        for(var i=0; i<data.length; i++){
            data[i].code = CryptoJS.AES.decrypt(data[i].code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
        }
        res.status(200).json(data);
    })
    .catch(err => {
        next(err);
    });
};