'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const User = new Schema({
    email: {
        type: String,
        require: true,
        index: true,
        unique: true
    },
    firstName: {
        type: String,
        require: true
    },
    lastName: {
        type: String,
        require: true
    },
    photourl: {
        type: String
    },
    country: {
        type: String
    },
    password: {
        type: String,
        require: true
    },
    active: {
        type: Boolean,
        default: false,
        require: true
    },
    code: {
        type: String,
        required: true
    },
    createAt: Date,
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
    return this.findOne(query);
};

User.statics.updateUser = function(userDetails) {
    return this.findOne({
        code: userDetails.code
    }).then(function(user) {
        if (user) {
            user.active = true;
            return user.save();
        }
    });
};

const userModel = mongoose.model('User', User, 'users');
module.exports = userModel;
