'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const Strategy = new Schema({
    name: {
        type: String,
        require: true,
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
    name: 1,
    user:1,
}, {
    unique: true
});

var CryptoJS = require("crypto-js");
var fs = require('fs');
var path = require('path');
const config = require('config');

Strategy.statics.createStrategy = function(user, name, desc, fname) { 
    var fname = "../examples/" + fname;

    var code = fs.readFileSync(path.resolve(path.join(__dirname, fname)), 'utf8');
    var encoded_code = CryptoJS.AES.encrypt(code, config.get('encoding_key'));
    const detail = {
        name: name,
        user: user._id,
        type: 'NA',
        language: 'julia',
        description: desc,
        code: encoded_code,
        createdAt: new Date()
    };

    const strategy = new this(detail);
    return strategy.saveAsync();
        
};

Strategy.statics.saveStrategy = function(strategyDetails) {
    const strategy = new this(strategyDetails);
    return strategy.saveAsync();
};

Strategy.statics.fetchStrategy = function(query) {
    return this.findOne(query).populate('user', '_id firstName lastName').execAsync();
};

Strategy.statics.fetchStrategys = function(query, sort_criteria) {
    if(sort_criteria)
        return this.find(query).sort(sort_criteria).populate('user', '_id firstName lastName').execAsync();
    else
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
                strategy.updatedAt= new Date();
                return strategy.save();
            }
        });
};

Strategy.statics.deleteStrategy = function(query) {
    return this.removeAsync(query);
};

const strategyModel = mongoose.model('Strategy', Strategy, 'strategy');
module.exports = strategyModel;