'use strict';
const config = require('config');
const mailer = require('express-mailer');
let appGbl;


var hostname = config.get('hostname');

module.exports.config = function(app) {
    appGbl = app;
    mailer.extend(app, config.get('mail'));
    app.set('views', __dirname + '/..' + '/views');
    app.set('view engine', 'jade');
};

module.exports.sendActivationEmail = function(res, userDetails) {
    appGbl.mailer.send('activate', {
        // REQUIRED. This can be a comma delimited string just like a normal email to field.
        to: userDetails.email,
        subject: 'Thank you for signing up', // REQUIRED.
        // All additional properties are also passed to the template as local variables.
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        url: hostname + '/api/v2/user/activate?code=' + userDetails.code
    }, function(err) {
        if (err) {
            // handle error
            // console.log(err);
            res.send('There was an error sending the email');
            return;
        }
        res.send('Email Sent');
    });
};

module.exports.resetSuccessEmail = function(res, userDetails) {
    appGbl.mailer.send('resetSuccess', {
        
        to: userDetails.email,
        subject: 'Password Reset Success', 
        
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
    }, function(err) {
        if (err) {
            console.log("Error in mail"+err)
            return;
        }
        console.log("Success in mail")
    });
};

module.exports.sendForgotEmail = function(res, userDetails) {
    console.log("Inside Emailer "+userDetails.email)
    appGbl.mailer.send('forgotPassword', {
        to: userDetails.email,
        subject: 'Forgot Password Mail', 
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        url: hostname + '/api/v2/user/resetpage?code=' + userDetails.code
    }, function(err) {
        console.log("Inside response ")
        if (err) {
            res.send('There was an error sending the email');
            return;
        }
        res.send('Email Sent with a link to reset your Password');
    });
};



module.exports.sendFeedbackEmail = function(res, args) {
   
  var email_json =  {
        to: 'arunfrom92@gmail.com',
        subject:  args.body.value.subject, 
        firstName: args.user.firstName,
        feedback : args.body.value.feedback,
        'email_id': args.user.email
    }

    console.log(email_json)

    appGbl.mailer.send('feedback', email_json, function(err,data) {
        if (err) {
            console.log("Error" + err);
            res.send('There was an error sending the email');
            return;
        }
        console.log("Email Sent: " + data)
        res.send('Email Sent');
    });
};

module.exports.sendInvite = function(res, args) {
   
  var email_json =  {
        bcc: args.body.value.email_list,
        email_id : args.user.email,
        firstName: args.user.firstName,
        subject : "Invite to join AimsQuant.com"
    }

    console.log(email_json);

    appGbl.mailer.send('invite', email_json, function(err,data) {
        if (err) {
            console.log("Error" + err);
            res.send('There was an error sending the email');
            return;
        }
        console.log("Email Sent: " + data)
        res.send('Email Sent');
    });
};

