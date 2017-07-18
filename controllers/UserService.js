'use strict';
const UserModel = require('../models/user');
const jwtUtil = require('../utils/jwttoken');
const hashUtil = require('../utils/hashUtil');
const sendEmail = require('../email');
const uuid = require('node-uuid');
const config = require('config');

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
            sendEmail.sendActivationEmail(res, userDetails);
        })
        .catch(err => {
            //next(err);
            if(err.code === 11000){
                return res.status(401).send('Email already registered, please login to continue');
            }else{
                return res.status(500).send('Internal server error');
            }
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
        if(!userM){
            return Promise.reject('Email is not registered, please sign up to continue')
        }
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
        return Promise.reject('Password did not match');
    })
    .spread(function(token, userDetails) {
        userDetails.token = token;
        delete userDetails.password;
        res.status(200).json(userDetails);
    })
    .catch(function(err) {
        return res.status(401).json(err); 
    });
};

exports.forgotPassword = function(args, res, next) {

    UserModel.updateCode({
        email: args.email.value
    }, uuid.v4())
    .then(function(userDetails) {
        delete userDetails.password;
         sendEmail.sendForgotEmail(res, userDetails);
    })
    .catch(err => {
        next(err);
    });
};

exports.activateUser = function(args, res) {
    UserModel.updateStatus({
        code: args.code.value
    }, {active:true})
    .then(function(userDetails) {
        sendEmail.welcomeEmail(res, userDetails);
    })
    .catch((err) => {
        res.status(400).json(err);
    });
};

exports.resetEmailLink = function(args, res) {
    var code = args.code.value;
    res.redirect(eval('`' + config.get('reset_password_url') + '`'));
};

exports.resetPassword = function(args, res, next) {

    const code = args.body.value.code;

    if(args.body.value.newpassword != args.body.value.password){

        res.send({status :200 , statusMessage : "Passwords do not match"});
        return;
    }
    if(args.body.value.newpassword.length < 8){

        res.send({status :200 , statusMessage : "Password length too short"});
        return;
    }
    hashUtil.genHash(args.body.value.newpassword)
        .then(function(hash) {
            return UserModel.updatePassword({
                code: code
            },hash);
        })
        .then(function(userDetails) {
            console.log(userDetails)
            if (userDetails) {
                delete userDetails.password;
                sendEmail.resetSuccessEmail(res, userDetails);
            }else{
                res.send('Not a valid code')
            }
        })
        .catch(err => {
            next(err);
        });
};

exports.getProfile = function (args, res, next) {
    const user = args.user;
    if (!user) {
        return next('NO USER');
    }
    delete user.password;
    res.status(200).json(user);
};

exports.sendFeedback = function (args, res, next) {
    var feedback =  args.body.value;
    sendEmail.sendFeedbackEmail(res, args);
};

exports.sendInvite = function (args, res, next) {
    sendEmail.sendInvite(res, args);
};