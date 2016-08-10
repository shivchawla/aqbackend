'use strict';
const UserModel = require('../models/user');
const jwtUtil = require('../utils/jwttoken');
const hashUtil = require('../utils/hashUtil');
const sendEmail = require('../email').sendMail;
const uuid = require('node-uuid');

exports.regiteruser = function(args, res, next) {
    const user = {
        email: args.body.value.email,
        firstName: args.body.value.firstName,
        lastName: args.body.value.lastName,
        password: args.body.value.password,
        code: uuid.v4()
    };
    hashUtil.genHash(user.password)
        .then(function(hash) {
            user.password = hash;
            return UserModel.saveUser(user);
        })
        .then(function(userDetails) {
            delete userDetails.password;
            sendEmail(res, userDetails);
            // res.status(200).json(userDetails);
        })
        .catch(err => {
            next(err);
        });
};

exports.userlogin = function(args, res, next) {
    const user = {
        email: args.body.value.email,
        password: args.body.value.password
    };
    UserModel.fetchUser({
        email: user.email
    })
    .then(function(userM) {
        const userDetails = userM.toObject();
        if (!userDetails.active) {
            return Promise.reject('Please validate your email');
        }
        return [hashUtil.comparePassword(userDetails.password, user.password), userDetails];
    })
    .spread(function(resp, userDetails) {
        if (resp) {
            return [jwtUtil.signToken(userDetails), userDetails];
        }
    })
    .spread(function(token, userDetails) {
        userDetails.token = token;
        delete userDetails.password;
        res.status(200).json(userDetails);
    })
    .catch(function(err) {
        next(err);
    });
};

exports.activateUser = function(args, res) {
    UserModel.updateUser({
        code: args.code.value
    })
    .then(function() {
        res.status(200).json('user is activated');
    })
    .catch((err) => {
        res.status(400).json(err);
    });
};
