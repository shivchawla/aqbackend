'use strict';
const config = require('config');
var jade = require('jade');
var fs = require('fs');
var sg = require('sendgrid')(config.get('sendgrid_key'));
var hostname = config.get('hostname');

var replaceAll = function(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}

module.exports.sendActivationEmail = function(res, userDetails) {
    var template = fs.readFileSync(__dirname + '/..' + '/views/ActivationEmail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
    template = template.replace('activationUrl', config.get('account_activation_url'));

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
                    subject: 'Thank you for signing up',
                },
            ],
            from: {
                email: 'admin@aimsquant.com',
            },
            "reply_to": {
                "email": "admin@aimsquant.com",
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
                email: 'admin@aimsquant.com',
            },
            "reply_to": {
                "email": "admin@aimsquant.com",
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
};

module.exports.sendForgotEmail = function(res, userDetails) {
    var template = fs.readFileSync(__dirname + '/../views/forgotpwdemail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace( 'resetPwdUrl', config.get('reset_password_url'));

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
                    subject: 'Forgot Password Mail',
                },
            ],
            from: {
                email: 'admin@aimsquant.com',
            },
            "reply_to": {
                "email": "admin@aimsquant.com",
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
                            email: 'admin@aimsquant.com'
                        },
                    ],
                    subject: args.body.value.subject,
                },
            ],
            from: {
                email: 'admin@aimsquant.com',
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
};

module.exports.sendInvite = function(res, args) {

    var template = fs.readFileSync(__dirname + '/../views/InviteFriendEmail.html').toString();
    template = template.replace('userFullName', args.user.firstName + ' '+args.user.lastName);
    template = template.replace('invitationUrl', config.get('user_invitation_url'));

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
                email: 'admin@aimsquant.com',
            },
            "reply_to": {
                "email": "admin@aimsquant.com",
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
};

