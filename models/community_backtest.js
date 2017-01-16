'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const Backtest = new Schema({
    strategy: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Strategy'
    },
    start: {
        type: Date,
        require: true
    },
    end: {
        type: Date,
        require: true
    },
    capital: {
        type: Number,
        require: true
    },
    plan: String,
    code: {
        type: String,
        require: false
    },
    analytics: {
        datapoints: [],
        totalRevenue: Number,
        avgAnnualReturn: Number,
        avgAnnualVolatility: Number
    },
    output: Schema.Types.Mixed,
    createdAt: Date,
    updatedAt: Date
});

Backtest.statics.saveBacktest = function(backtestDetails) {
    const backtest = new this(backtestDetails);
    return backtest.saveAsync();
};

Backtest.statics.fetchBacktest = function(query) {
    return this.findOne(query).populate('user', '_id firstName lastName').execAsync();
};

Backtest.statics.fetchBacktests = function(query, limit, skip) {
    return this.find(query, { skip: skip, limit: limit }).populate('user', '_id firstName lastName').execAsync();
};

Backtest.statics.findCount = function(query) {
    return this.countAsync(query);
};

Backtest.statics.removeAllBack = function(query) {
    return this.removeAsync(query);
};

Backtest.statics.updateBacktest = function(query, status) {
    return this.findOne(query)
        .then(function(backtest) {
            if (backtest) {
                backtest.active = status;
                return backtest.save();
            }
        });
};

const backtestModel = mongoose.model('Community_backtest', Backtest, 'community_backtest');
module.exports = backtestModel;
