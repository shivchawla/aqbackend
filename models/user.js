'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const _ = require('lodash');

const User = new Schema({    
    email: {
        type: String,
        required: true,
        index: true,
        unique: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    photourl: {
        type: String
    },
    country: {
        type: String
    },
    password: {
        type: String,
        required: true
    },
    active: {
        type: Boolean,
        default: false,
        required: true
    },
    code: {
        type: String,
        required: true
    },

    jwtId: {
        type: String,
        required: true
    },

    emailpreference: {
        daily_performance_digest: {
            type: Boolean,
            default: true,
        },
        weekly_performance_digest: {
            type: Boolean,
            default: true,
        },
        
        marketing_digest: {
            type: Boolean,
            default: true,
        }
    },

    createdDate: Date,

    isUserFromGoogle: {
        type: Boolean,
        default: false
    },

    backtestSubscription: {
        counter: {type: Number, default: 0},
        maximum: {type: Number, default: 20}
    }
});

User.index({
    email: 1
}, {
    unique: true
});

User.statics.saveUser = function(userDetails) {
    const user = new this(userDetails);
    return user.save();
};

User.statics.fetchUser = function(query, options = {}) {
    var q = this.findOne(query);

    if(options.fields) {
        q = q.select(options.fields);
    }

    return q.execAsync();
};

User.statics.countUsers = function(query) {
    return this.countAsync(query);
};

User.statics.fetchUsers = function(query, projections, options) {
    return this.find(query, projections)
    .skip(_.get(options, 'skip', 0))
    .limit(_.get(options, 'limit', 10))
    .execAsync()
};

User.statics.updateStatus = function(query, status) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                user.active = status;
                return user.save();
            }
        });
};

User.statics.updateCode = function(query, code) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                user.code = code;
                return user.save();
            } else {
                throw new Error("Not a registered user");
            }
        });
};

User.statics.updateJwtId = function(query, jwtId) {
    return this.findOne(query)
    .then(user => {
        if (user) {
            user.jwtId = jwtId;
            return user.save();
        } else {
            throw new Error("Not a registered user");
        }
    });
};

User.statics.updatePassword = function(query, hash) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                user.password = hash;
                return user.save();
            }
        });
};

User.statics.updateEmailPreference = function(query, preferences) {
    var updateObj = {};
    Object.keys(preferences).forEach(key => {
        var modifiedKey = `emailpreference.${key}`;
        updateObj = Object.assign(updateObj, {[modifiedKey]: preferences[key]}); 
    });

    return this.findOneAndUpdate(query, {$set: updateObj});
};


User.statics.resetBacktestCounter = function(query) {
    return this.updateOne(query, {$set: {'backtestSubscription.counter': 0}});
}

User.statics.shiftBacktestCounter = function(query, inc=1) {
    return this.updateOne(query, {$inc: {'backtestSubscription.counter': inc}});
}

User.statics.updateBacktestSubscription = function(query, maxCount) {
    return this.updateOne(query, {$set: {'backtestSubscription.maximum': maxCount}});
}

const userModel = mongoose.model('User', User, 'users');
module.exports = userModel;
