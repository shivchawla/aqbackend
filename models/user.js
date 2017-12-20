'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

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
    createdAt: {
        type: Date,
        //required: true,
    },
    updatedAt: Date

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

User.statics.fetchUser = function(query) {
    return this.findOne(query).execAsync();
};

User.statics.fetchUsers = function(query, projections) {
    return this.find(query, projections).execAsync()
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

const userModel = mongoose.model('User', User, 'users');
module.exports = userModel;
