'use strict';
const config = require('config');
const mailer = require('express-mailer');
let appGbl;
var jade = require('jade');
var fs = require('fs');
var constants = require('../utils/Constants.js');
var sg = require('sendgrid')(constants.sendgrid_key);
var hostname = config.get('hostname');

var replaceAll = function(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}

//module.exports.config = function(app) {
//    appGbl = app;
//    mailer.extend(app, config.get('mail'));
//    app.set('views', __dirname + '/..' + '/views');
//    app.set('view engine', 'jade');
//};

module.exports.sendActivationEmail = function(res, userDetails) {
    var template = fs.readFileSync(__dirname + '/..' + '/views/ActivationEmail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
    template = template.replace('activationUrl', constants.account_activation_url);

    console.log(template)
    var request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: {
            personalizations: [
                {
                    to: [
                        {
                            email: userDetails.email,
                            name:userDetails.firstName + ' '+userDetails.lastName
                        },
                    ],
                    subject: 'Thank you for signing up',
                },
            ],
            from: {
                email: 'contact@aimsquant.com',
            },
            "reply_to": {
                "email": "contact@aimsquant.com",
                "name": "Aimsquant"
            },
            content: [
                {
                    type: 'text/html',
                    value: template,
                },
            ],
        },
    });
    sg.API(request, function(err, response) {
        if (err) {
            console.log("mail sent error : " + err);
            return res.send('There was an error sending the email');
        }
        console.log("mail sent : " + response);
        res.send(userDetails);
    });

    //appGbl.mailer.send('activate', {
    //    // REQUIRED. This can be a comma delimited string just like a normal email to field.
    //    to: userDetails.email,
    //    subject: 'Thank you for signing up', // REQUIRED.
    //    // All additional properties are also passed to the template as local variables.
    //    firstName: userDetails.firstName,
    //    lastName: userDetails.lastName,
    //    url: hostname + '/api/v2/user/activate?code=' + userDetails.code
    //}, function(err) {
    //    if (err) {
    //        // handle error
    //        // console.log(err);
    //        res.send('There was an error sending the email');
    //        return;
    //    }
    //    res.send('Email Sent');
    //});
};

module.exports.resetSuccessEmail = function(res, userDetails) {
    var request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: {
            personalizations: [
                {
                    to: [
                        {
                            email: userDetails.email,
                            name:userDetails.firstName + ' '+userDetails.lastName
                        },
                    ],
                    subject: 'Password Reset Success',
                },
            ],
            from: {
                email: 'contact@aimsquant.com',
            },
            "reply_to": {
                "email": "contact@aimsquant.com",
                "name": "Aimsquant"
            },
            content: [
                {
                    type: 'text/html',
                    value: 'resetSuccess',
                },
            ],
        },
    });
    sg.API(request, function(err, response) {
        if (err) {
            console.log("Error in mail"+err)
            return;
        }
        console.log("Success in mail")
    });

    //appGbl.mailer.send('resetSuccess', {
    //
    //    to: userDetails.email,
    //    subject: 'Password Reset Success',
    //
    //    firstName: userDetails.firstName,
    //    lastName: userDetails.lastName,
    //}, function(err) {
    //    if (err) {
    //        console.log("Error in mail"+err)
    //        return;
    //    }
    //    console.log("Success in mail")
    //});
};

module.exports.sendForgotEmail = function(res, userDetails) {
    var template = fs.readFileSync(__dirname + '/../views/forgotpwdemail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace( 'resetPwdUrl', constants.reset_password_url);

    //console.log(template)
    var request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: {
            personalizations: [
                {
                    to: [
                        {
                            email: userDetails.email,
                            name:userDetails.firstName + ' '+userDetails.lastName
                        },
                    ],
                    subject: 'Forgot Password Mail',
                },
            ],
            from: {
                email: 'contact@aimsquant.com',
            },
            "reply_to": {
                "email": "contact@aimsquant.com",
                "name": "Aimsquant"
            },
            content: [
                {
                    type: 'text/html',
                    value: template,
                },
            ],
        },
    });
    sg.API(request, function(err, response) {
        if (err) {
            res.send('There was an error sending the email');
            return;
        }
        console.log(response);
        res.send('Email Sent with a link to reset your Password');
    });

    //console.log("Inside Emailer "+userDetails.email)
    //appGbl.mailer.send('forgotPassword', {
    //    to: userDetails.email,
    //    subject: 'Forgot Password Mail',
    //    firstName: userDetails.firstName,
    //    lastName: userDetails.lastName,
    //    url: hostname + '/api/v2/user/resetpage?code=' + userDetails.code
    //}, function(err) {
    //    console.log("Inside response ")
    //    if (err) {
    //        res.send('There was an error sending the email');
    //        return;
    //    }
    //    res.send('Email Sent with a link to reset your Password');
    //});
};



module.exports.sendFeedbackEmail = function(res, args) {
    var request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: {
            personalizations: [
                {
                    to: [
                        {
                            email: 'contact@aimsquant.com'
                        },
                    ],
                    subject: args.body.value.subject,
                },
            ],
            from: {
                email: 'contact@aimsquant.com',
            },
            "reply_to": {
                "email": args.user.email,
                "name": args.user.firstName
            },
            content: [
                {
                    type: 'text/html',
                    value: args.body.value.feedback,
                },
            ],
        },
    });
    sg.API(request, function(err, response) {
        if (err) {
            res.send('There was an error sending the email');
            return;
        }
        console.log(response);
        res.send('Email Sent with a link to reset your Password');
    });

  //var email_json =  {
  //      to: 'arunfrom92@gmail.com',
  //      subject:  args.body.value.subject,
  //      firstName: args.user.firstName,
  //      feedback : args.body.value.feedback,
  //      'email_id': args.user.email
  //  }
  //
  //  console.log(email_json)
  //
  //  appGbl.mailer.send('feedback', email_json, function(err,data) {
  //      if (err) {
  //          console.log("Error" + err);
  //          res.send('There was an error sending the email');
  //          return;
  //      }
  //      console.log("Email Sent: " + data)
  //      res.send('Email Sent');
  //  });
};

module.exports.sendInvite = function(res, args) {

    var template = fs.readFileSync(__dirname + '/../views/InviteFriendEmail.html').toString();
    template = template.replace('userFullName', args.user.firstName + ' '+args.user.lastName);
    template = template.replace('invitationUrl', constants.user_invitation_url);

    /**
     * bcc email array should be in the form: [
     {
         "email": "sam.doe@example.com",
         "name": "Sam Doe"
     }
     ]
     * @type {*|SendGrid.Rest.Request}
     */
    var request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: {
            personalizations: [
                {
                    to: [
                        {
                            email: args.user.email,
                            name:args.user.firstName + ' '+args.user.lastName
                        },
                    ],
                    subject: 'Invite to join AimsQuant.com',
                    "bcc": args.body.value.email_list
                },
            ],
            from: {
                email: 'contact@aimsquant.com',
            },
            "reply_to": {
                "email": "contact@aimsquant.com",
                "name": "Aimsquant"
            },
            content: [
                {
                    type: 'text/html',
                    value: template,
                },
            ],
        },
    });
    sg.API(request, function(err, response) {
        if (err) {
            console.log("Error" + err);
            res.send('There was an error sending the email');
            return;
        }
        console.log("Email Sent: " + response)
        res.send('Email Sent');
    });
   
  //var email_json =  {
  //      bcc: args.body.value.email_list,
  //      email_id : args.user.email,
  //      firstName: args.user.firstName,
  //      subject : "Invite to join AimsQuant.com"
  //  }
  //
  //  console.log(email_json);
  //
  //  appGbl.mailer.send('invite', email_json, function(err,data) {
  //      if (err) {
  //          console.log("Error" + err);
  //          res.send('There was an error sending the email');
  //          return;
  //      }
  //      console.log("Email Sent: " + data)
  //      res.send('Email Sent');
  //  });
};

