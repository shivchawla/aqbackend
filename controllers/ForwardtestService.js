'use strict';
require('../utils/spawn');
const ForwardTestModel = require('../models/forwardtest');
const StrategyModel = require('../models/strategy');
var CryptoJS = require("crypto-js");
const config = require('config');

exports.createForwardtest = function(strategy, values, res, next) {
    const forwardtest = {
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

    ForwardTestModel.saveForwardTest(forwardtest)
    .then(ft => {
        res.status(200).json(ft);
    })
    .catch(err => {
        console.log(err);
        next(err);
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
            options.select.append(',strategy');
        }
    }

    ForwardTestModel.fetchForwardTest({
        _id: forwardtestId,
    }, options)
    .then(ft => {
        if(ft.shared || ft.strategy.user.toString() == userId.toString()) {
            ft.code = CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8);
            res.status(200).json(ft);
        } else {
            res.status(400).json({id:forwardtestId, message:"forwardtestId doesn't exist for the user"});
        }
    })
    .catch(err => {
        next(err);
    });
};


//How to make this linear and NOT nested
exports.deleteForwardTest = function(args, res, next) {
    const forwardtestId = args.forwardtestId.value;
    const userId = args.user._id;

    ForwardTestModel.fetchForwardTest({_id : forwardtestId, shared : true}, {})
    .then(forwardtest => {
        if(forwardtest && forwardtest.strategy.user.toString() == userId){
            ForwardTestModel.updateForwardTest({_id: forwardtestId}, {deleted : true})
            .then(obj => {
                console.log("Soft delete")
                res.status(200).json({forwardtestId: forwardtestId, message:"Successfly deleted"});
            })
            .catch(err => {
                next(err);
            });
        } else {
            ForwardTestModel.removeAllBack({
                _id: forwardtestId,
                shared:false
            })
            .then(obj => {
                console.log("Hard Delete")
                res.status(200).json({forwardtestId: forwardtestId, message:"Successfly deleted"});
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

exports.updateForwardTest = function(args, res, next) {
    const forwardtestId = args.forwardtestId.value;
    const userId = args.user._id;

    const updates = {};

    if(args.name.value) {
        updates.name = args.name.value;
    }

    if(args.notes.value) {
        updates.notes = args.notes.value;
    }

    ForwardTestModel.updateForwardTest({user: userId, _id: forwardtestId}, updates)
    .then(obj => {
        if(obj) {
            return res.status(200).json(obj);
        }
    })
    .catch(err=>{
        next(err);
    });

};
