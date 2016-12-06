'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const Backtest = new Schema({
    strategy: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Strategy'
    },
    settings: {
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
        plan: String
    },
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

Backtest.statics.fetchBacktests = function(query) {
    return this.find(query).populate('user', '_id firstName lastName').execAsync();
};

Backtest.statics.findCount = function(query) {
    return this.countAsync(query);
};

Backtest.statics.removeAllBack = function(query) {
    return this.removeAsync(query);
};

Backtest.statics.updateBacktest = function(query, result) {
    return this.findOne(query)
        .then(function(backtest) {
            if (backtest) {
                backtest.output = result;
                return backtest.save();
            }
        });
};

const backtestModel = mongoose.model('Backtest', Backtest, 'backtests');
module.exports = backtestModel;
