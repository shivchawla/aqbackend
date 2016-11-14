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
        require: false
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

Strategy.statics.updateStrategy = function(query, updates) {
    return this.findOne(query)
        .then(function(strategy) {
            if (strategy) {
                const keys = Object.keys(updates);
                keys.forEach(key => {
                    strategy[key] = updates[key];
                });
                return strategy.save();
            }
        });
};

Strategy.statics.deleteStrategy = function(query) {
    return this.removeAsync(query);
};

const strategyModel = mongoose.model('Strategy', Strategy, 'strategys');
module.exports = strategyModel;
