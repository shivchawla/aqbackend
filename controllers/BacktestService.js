'use strict';
require('../utils/spawn');
const BacktestModel = require('../models/backtest');
const Community_backtest = require('../models/community_backtest');
const StrategyModel = require('../models/strategy');
// const exec = require('../utils/spawn');

exports.createBacktest = function(strategy, values, res, next) {
    const backtest = {
        strategy: strategy._id,
        settings: {
            start: new Date(values.start),
            end: new Date(values.end),
            capital: values.capital,
            plan: values.plan
        },
        code: strategy.code,
        status : 'active',
        createdAt : new Date()
    };
    return BacktestModel.saveBacktest(backtest)
    .then(backtst => {
        //console.log(backtst)
        res.status(200).json(backtst);
    })
    .catch(err => {
        console.log(err);
        next(err);
    });
};

exports.getBackTests = function(args, res, next) {
    const user = args.user;
    const id = args.id.value;
    StrategyModel.fetchStrategy({
        user: user._id,
        _id: id
    })
    .then(strategy => {
        return BacktestModel.fetchBacktests({
            strategy: strategy._id
        });
    })
    .then(backtests => {
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
        res.status(200).json(bt);
    })
    .catch(err => {
        next(err);
    });
};

exports.deleteBackTest = function(args, res, next) {
    const id = args.id.value;
    BacktestModel.fetchBacktest({_id : id, referenced : true}).then((bacttestObj)=>{
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
                _id: id
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
    StrategyModel.fetchStrategy({
        name: 'Community'
    })
    .then(strat => {
        const strategy = strat.toObject();
        return BacktestModel.fetchBacktests({
            strategy: strategy._id
        });
    })
    .then(data => {
        res.status(200).json(data);
    })
    .catch(err => {
        next(err);
    });
};
