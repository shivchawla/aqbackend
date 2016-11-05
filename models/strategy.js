'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const Strategy = new Schema({
    name: {
        type: String,
        require: true,
        index: true,
        unique: true
    },
    user: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },
    type: {
        type: String,
        require: true
    },
    language: {
        type: String,
        require: true
    },
    description: {
        type: String,
        require: true
    },
    code: {
        type: String,
        require: true
    },
    settings: {
        start: Date,
        end: Date,
        capital: Number,
        plan: String
    },
    createdAt: Date,
    updatedAt: Date
});

Strategy.index({
    name: 1
}, {
    unique: true
});

Strategy.statics.saveStrategy = function(strategyDetails) {
    const strategy = new this(strategyDetails);
    return strategy.saveAsync();
};

Strategy.statics.fetchStrategy = function(query) {
    return this.findOne(query).populate('user', '_id firstName lastName').execAsync();
};

Strategy.statics.fetchStrategys = function(query) {
    return this.find(query).populate('user', '_id firstName lastName').execAsync();
};

Strategy.statics.updateStrategy = function(query, status) {
    return this.findOne(query)
        .then(function(strategy) {
            if (strategy) {
                strategy.active = status;
                return strategy.save();
            }
        });
};

const strategyModel = mongoose.model('Strategy', Strategy, 'strategys');
module.exports = strategyModel;
