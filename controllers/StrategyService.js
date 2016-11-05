'use strict';
const StrategyModel = require('../models/strategy');

exports.createStrategy = function(args, res, next) {
    const user = args.user;
    const values = args.body.value;
    const Strategy = {
        name: values.name,
        user: user._id,
        type: values.name,
        language: values.language,
        description: values.description,
        code: values.code,
        settings: values.settings,
        createdAt: new Date()
    };
    StrategyModel.saveStrategy(Strategy)
        .then(strategy => {
            return res.status(200).json(strategy);
        })
        .catch(err => {
            next(err);
        });
};

exports.execStrategy = function(args, res, next) {
    // this should create new back test
    next('Not implemented');
};

exports.getBackTests = function(args, res, next) {
    next();
};

exports.getStrategys = function(args, res, next) {
    const user = args.user;
    StrategyModel.fetchStrategys({
        user: user._id
    })
    .then(strategy => {
        res.status(200).json(strategy);
    })
    .catch(err => {
        next(err);
    });
};

exports.getStrategy = function(args, res, next) {
    const user = args.user;
    const id = args.id.value;
    StrategyModel.fetchStrategy({
        user: user._id,
        _id: id
    })
    .then(strategy => {
        res.status(200).json(strategy);
    })
    .catch(err => {
        next(err);
    });
};

exports.updateStrategy = function(args, res, next) {
    next();
};
