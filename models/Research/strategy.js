'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;
const Strategy = new Schema({
    name: {
        type: String,
        required: true,
    },

    suffix: {
        type: Number,
        default: 0,
    },

    fullName: {
        type: String
    },

    user: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    type: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: false
    },

    tradeDirection: {
        type:String,
        required: false
    },

    entryConditions: [{
        type: Schema.Types.Mixed,
        required: false
    }],

    exitConditions: [{
        type: Schema.Types.Mixed,
        required: false
    }],

    entryLogic: {type: String, required: false},
    exitLogic: {type: String, required: false},

    createdAt: Date,
    updatedAt: Date,
    
    deleted: {
        type: Boolean,
        default: false,
    },
});

Strategy.index({
    fullName: 1,
    user:1,
}, {
    unique: true
});

var CryptoJS = require("crypto-js");
var fs = require('fs');
var path = require('path');
const config = require('config');
const _ = require('lodash');


Strategy.statics.createStrategy = function(inputs) { 
    
    var type = _.get(inputs, 'type', "CODE")

    let fname = "../../examples/" + inputs.fname;

    var code = fs.readFileSync(path.resolve(path.join(__dirname, fname)), 'utf8');
    var encoded_code = CryptoJS.AES.encrypt(code, config.get('encoding_key'));
    const detail = {
        name: _.get(inputs, 'name', "").trim(),
        user: _.get(inputs, 'user._id', ""),
        type: _.get(inputs, 'type', "CODE"),
        description: _.get(inputs, 'description', ""),
        code: encoded_code,
        entryConditions: _.get(inputs, "entryConditions", []),
        exitConditions: _.get(inputs, "exitConditions", []),
        entryLogic: _.get(inputs, "entryLogic", ""),
        exitLogic: _.get(inputs, "exitLogic", ""),
        createdAt: new Date()
    };

    return this.find({name: detail.name, user:detail.user})
    .then(strategies => {
        if(strategies.length > 0) {
            
            detail.suffix = Math.max.apply(null, strategies.map(item => item.suffix)) + 1;
            detail.fullName = detail.name + `(${detail.suffix})`;
        } else {
            detail.fullName = detail.name;
        }

        const strategy = new this(detail);
        return strategy.saveAsync();
    });
};

Strategy.statics.saveStrategy = function(strategyDetails) {
    const strategy = new this(strategyDetails);
    return strategy.saveAsync();
};

Strategy.statics.fetchStrategy = function(query, options) {
    
    var q = this.findOne(query);
        
    if(options.select) {
        if(options.select.indexOf('user') == -1) {
            options.select.concat(',user');
        }

        options.select.replace(',', ' ');
        q = q.select(options.select);
    }

    return q.populate('user', '_id firstName lastName').execAsync();
};

Strategy.statics.fetchStrategys = function(query, sort_criteria) {
  
    if(sort_criteria)
        return this.find(query).sort(sort_criteria).populate('user', '_id firstName lastName').execAsync();
    else
        return this.find(query).populate('user', '_id firstName lastName').execAsync();
   
};

Strategy.statics.updateStrategy = function(query, updates) {
    this.findOne(query)
    .then(strategy => {
        if (strategy) {
            const keys = Object.keys(updates);
            keys.forEach(key => {
                strategy[key] = updates[key];
            });
            strategy.updatedAt= new Date();
            return strategy.saveAsync();
        }
    });
};

Strategy.statics.deleteStrategy = function(query) {
    return this.removeAsync(query);
};

const strategyModel = mongoose.model('Strategy', Strategy, 'strategy');
module.exports = strategyModel;
