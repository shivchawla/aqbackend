'use strict';
const UserModel = require('../../models/user');
const jwtUtil = require('../../utils/jwttoken');
const hashUtil = require('../../utils/hashUtil');
const sendEmail = require('../../email');
const uuid = require('node-uuid');
const config = require('config');
var request = require('request');
const Promise = require('bluebird');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const APIError = require('../../utils/error');

exports.registerUser = function(args, res, next) {
    const user = {
        email: args.body.value.email.toLowerCase(),
        firstName: args.body.value.firstName,
        lastName: args.body.value.lastName,
        password: args.body.value.password,
        code: uuid.v4(),
        createdDate: new Date(),
    };

    const source = res && res.req && res.req.headers && res.req.headers.origin ? 
        res.req.headers.origin.indexOf("aimsquant")!=-1 ? "aimsquant" : "adviceqube" : "adviceqube";

    hashUtil.genHash(user.password)
    .then(hash => {
        user.password = hash;
        return UserModel.saveUser(user);
    })
    .then(userDetails => {
        delete userDetails.password;
        sendEmail.sendActivationEmail(res, userDetails, source);
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
        email: args.body.value.email.toLowerCase(),
        password: args.body.value.password
    };

    let userDetails;

    UserModel.fetchUser({
        email: user.email
    })
    .then(userM => {
        if(!userM){
            return Promise.reject('Email is not registered, please sign up to continue');
        }
        
        userDetails = userM.toObject();
        if (!userDetails.active) {
            
            //Resend the activation email
            const source = res && res.req && res.req.headers && res.req.headers.origin ? 
                res.req.headers.origin.indexOf("aimsquant")!=-1 ? "aimsquant" : "adviceqube" : "adviceqube";

            return sendEmail.sendActivationEmail(null, userDetails, source)
            .then(val => {
                return Promise.reject('Check your email for account activation instructions');
            }
        } else {
            return hashUtil.comparePassword(userDetails.password, user.password);
        }
    })
    .then(resp => {
        if (resp) {
            return jwtUtil.signToken(userDetails);
        }

        return Promise.reject('Username or Password is incorrect');
    })
    .then(token => {
        userDetails.token = token;
        delete userDetails.password;
        delete userDetails.code;
        
        return Promise.all([
            InvestorModel.fetchInvestor({user:userDetails._id}, {insert:true}),
            AdvisorModel.fetchAdvisor({user:userDetails._id}, {insert:true})
        ]);
    })
    .then(([investor, advisor]) => {
        userDetails.investor = investor._id;
        userDetails.advisor = advisor._id;
        res.status(200).json(userDetails);
    })
    .catch(function(err) {
        return res.status(401).json(err);
    });
};

exports.forgotPassword = function(args, res, next) {

    const source = res && res.req && res.req.headers && res.req.headers.origin ? 
        res.req.headers.origin.indexOf("aimsquant")!=-1 ? "aimsquant" : "adviceqube" : "adviceqube";

    UserModel.updateCode({
        email: args.email.value.toLowerCase(),
    }, uuid.v4())
    .then(function(userDetails) {
        delete userDetails.password;
        sendEmail.sendForgotEmail(res, userDetails, source);
    })
    .catch(err => {
        console.log(err);
        return res.status(400).send(err.message);
    });
};

exports.activateUser = function(args, res) {

    const source = res && res.req && res.req.headers && res.req.headers.origin ? 
        res.req.headers.origin.indexOf("aimsquant")!=-1 ? "aimsquant" : 
            "adviceqube" : args.source ? args.source.value : "adviceqube";

    UserModel.updateStatus({
        code: args.code.value
    }, {active:true})
    .then(function(userDetails) {
        sendEmail.welcomeEmail(res, userDetails, source);
    })
    .catch((err) => {
        res.status(400).json(err);
    });
};

exports.resetEmailLink = function(args, res) {
    const code = args.code.value;
    const source = res && res.req && res.req.headers && res.req.headers.origin ? 
        res.req.headers.origin.indexOf("aimsquant")!=-1 ? "aimsquant" : 
        "adviceqube" : args.source ? args.source.value : "adviceqube";

    res.redirect(eval('`' + config.get(`reset_password_url.${source}`) + '`'));
};

exports.resetPassword = function(args, res, next) {

    const code = args.body.value.code;

    const source = res && res.req && res.req.headers && res.req.headers.origin ? 
        res.req.headers.origin.indexOf("aimsquant")!=-1 ? "aimsquant" : "adviceqube" : "adviceqube";

    if(args.body.value.newpassword != args.body.value.password){

        res.status(400).send({statusMessage : "Passwords do not match"});
        return;
    }
    if(args.body.value.newpassword.length < 8){

        res.status(400).send({statusMessage : "Password length too short"});
        return;
    }
    hashUtil.genHash(args.body.value.newpassword)
        .then(function(hash) {
            return UserModel.updatePassword({
                code: code
            },hash);
        })
        .then(function(userDetails) {
            if (userDetails) {
                delete userDetails.password;
                sendEmail.resetSuccessEmail(res, userDetails, source);
            }else{
                res.send('Not a valid code')
            }
        })
        .catch(err => {
            next(err);
        });
};

exports.getProfile = function (args, res, next) {
    let user = args.user;
    const isAdmin = config.get('admin_user').indexOf(user.email) !== -1;
    user = Object.assign(user, {isAdmin: isAdmin});
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

exports.updateToken = function(args, res, next) {
    const userEmail = args.body.value.email.toLowerCase();
    const token = args.body.value.token;

    var options = {ignoreExpiration: true};
    jwtUtil.verifyToken(token, options)
    .then(decoded => {
        //Check if token expired within last 15 minute
        if (decoded.exp*1000 <= Date.now() - 15*60*1000) {
            throw new Error("Token Expired long back");
        } else {
            return UserModel.fetchUser({
                _id: decoded._id,
                email: userEmail});
        }
    })
    .then(user => {
        if(user) {
            const userDetails = user.toObject();
            if (!userDetails.active) {
                throw new Error('User not active');
            }
            return [jwtUtil.signToken(userDetails), userDetails];
        } else {
            throw new Error("Unauthorized Access");
        }
    })
    .spread(function(token, userDetails){
        userDetails.token = token;
        delete userDetails.password;
        return res.status(200).json(userDetails);
    })
    .catch(err => {
        return res.status(400).send(err.message);
    })
};

exports.verifyCaptchaToken = function(args, res, next) {
    const captchaToken = args.body.value.token;
    const secret = "6Lfm6z8UAAAAAB4i3G4ay-4ptaN9KdEmSwl1zE3Q";
    const url = "https://www.google.com/recaptcha/api/siteverify";
    const input = {response: captchaToken, secret:secret};


    request.post(url, {json: true, body: input}, function(err, response, body) {
        if (!err && response.statusCode === 200) {
            res.status(200).send({message:"Captcha token valid"});  
        } else {
            res.status(response.statusCode).send({message:"Error validating captcha"});
        }
    });
};

exports.sendInfoEmail = function (args, res, next) {
    const user = args.user;

    UserModel.fetchUser({email:'shivchawla2001@gmail.com'})
    .then(adminUser => {
       if(adminUser._id.toString() == user._id.toString()) {
            return UserModel.fetchUsers({},{firstName:1, lastName:1 , email:1}) 
       } else {
            throw new Error("Not Authorized");
       }
    })
    .then(users => {
        var details = args.body.value;
        details.receivers = users;
        sendEmail.sendInfoEmail(details);
        return res.status(200).send("Emails sent successfully");    
    })
    .catch(err => {
        return res.status(400).send(err.message);
    });
};
