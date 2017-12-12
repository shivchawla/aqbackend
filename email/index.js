'use strict';
const config = require('config');
var jade = require('jade');
var fs = require('fs');
var sg = require('sendgrid')(config.get('sendgrid_key'));
var hostname = config.get('hostname');
var truncate = require('truncate-html');

var replaceAll = function(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}

module.exports.sendActivationEmail = function(res, userDetails) {
    var template = fs.readFileSync(__dirname + '/..' + '/views/ActivationEmail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
    template = template.replace('activationUrl', config.get('account_activation_api_url') + userDetails.code);

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
                    subject: 'Activate your account',
                },
            ],
            from: {
                email: 'admin@aimsquant.com',
                name: 'AimsQuant',
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
            return res.send('There was an error sending the email');
        }
        res.send(userDetails);
    });
};

module.exports.resetSuccessEmail = function(res, userDetails) {
    
    var template = fs.readFileSync(__dirname + '/../views/ResetPasswordEmail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace('userEmailAddress', userDetails.email);
   
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
                name: 'AimsQuant'
            },
            "reply_to": {
                "email": "admin@aimsquant.com",
                "name": "AimsQuant"
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
            return;
        }

        res.send('Password reset successfuly}');
    });
};

module.exports.sendForgotEmail = function(res, userDetails) {
    var template = fs.readFileSync(__dirname + '/../views/forgotpwdemail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace('userEmailAddress', userDetails.email);
    template = template.replace( 'resetPwdUrl', config.get('reset_password_api_url') + userDetails.code);

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
                    subject: 'Reset your password',
                },
            ],
            from: {
                email: 'admin@aimsquant.com',
                name: 'AimsQuant',
            },
            "reply_to": {
                "email": "admin@aimsquant.com",
                "name": "AimsQuant"
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
        res.send('Email Sent with a link to reset your Password');
    });
};

module.exports.welcomeEmail = function(res, userDetails) {
    var template = fs.readFileSync(__dirname + '/../views/WelcomeEmail.html').toString();
    template = template.replace('userFullName', userDetails.firstName + ' '+userDetails.lastName);
  
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
                    subject: 'Welcome to AimsQuant',
                },
            ],
            from: {
                email: 'admin@aimsquant.com',
                name: 'AimsQuant'
            },
            "reply_to": {
                "email": "admin@aimsquant.com",
                "name": "AimsQuant"
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

        res.redirect(config.get('activation_url'));
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
                email: args.user.email,
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
                            email: args.body.value.emailList
                        },
                    ],
                    subject: 'Invite to join AimsQuant.com',
                },
            ],
            from: {
                email: 'admin@aimsquant.com',
                name:'AimsQuant',
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
        res.send('Email Sent');
    });
};

module.exports.threadReplyEmail = function(threadDetails) {

    var replyUser = threadDetails.lastCommentedUser;
    var replyUserFullName = `${replyUser.firstName}${replyUser.lastName}`;
    var homeLink = config.get('hostname');
    var postLink = `${homeLink}/#/dashboard/community/${threadDetails._id}`;
    var unfollowLink = `${homeLink}/?unfollow=1#/dashboard/community/${threadDetails._id}`;
    var template = fs.readFileSync(__dirname + '/../views/threadReplyEmail.html').toString();
    template = template.replace('replyUserFullName', replyUserFullName);
    template = template.replace('postTitle', threadDetails.title);
    template = template.replace('postFirstLine', truncate(threadDetails.markdownText, {length: 300, excludes: 'img'}));
    template = template.replace(/postLink/g, postLink);
    template = template.replace(/homeLink/g, homeLink);
    template = template.replace(/unfollowLink/g, unfollowLink);

    /**
     * bcc email array should be in the form: [
     {
         "email": "sam.doe@example.com",
         "name": "Sam Doe"
     }
     ]
     * @type {*|SendGrid.Rest.Request}
     */

    var slicedTitle = threadDetails.title.slice(0, 60); 
    
    threadDetails.followers.forEach(follower => {
        if(threadDetails.lastCommentedUser._id != follower._id) {
            var followerFullName = `${follower.firstName}${follower.lastName}`;
            var _t = template.replace('followerFullName', followerFullName);

            var request = sg.emptyRequest({
                method: 'POST',
                path: '/v3/mail/send',
                body: {
                    personalizations: [
                        {
                            to: [
                                {
                                    email: follower.email,
                                },
                            ],
                            subject: `Re:[AimsQuant] ${slicedTitle}`,
                        },
                    ],
                    from: {
                        email: 'no-reply@aimsquant.com',
                        name:`${replyUserFullName}`,
                    },
                    content: [
                        {
                            type: 'text/html',
                            value: _t,
                        },
                    ],
                },
            });
            sg.API(request, function(err, response) {
                if (err) {
                    console.log('There was an error sending the email');
                    return;
                }
                console.log('Email Sent');
            });
        }
    });

    return;
};

module.exports.sendInfoEmail = function(details) {

    var receivers = details.receivers;
    var templateFileName = details.templateFileName;
    var template = fs.readFileSync(__dirname + `/../views/${templateFileName}`).toString();
    var homeLink = config.get('hostname');
    template = template.replace(/homeLink/g, homeLink);
    /**
     * bcc email array should be in the form: [
     {
         "email": "sam.doe@example.com",
         "name": "Sam Doe"
     }
     ]
     * @type {*|SendGrid.Rest.Request}
     */

    
    receivers.forEach(receiver => {
        var receiverFullName = `${receiver.firstName} ${receiver.lastName}`;
        var _t = template.replace('receiverFullName', receiverFullName);

        var request = sg.emptyRequest({
            method: 'POST',
            path: '/v3/mail/send',
            body: {
                personalizations: [
                    {
                        to: [
                            {
                                email:receiver.email,
                            },
                        ],
                        subject: `[AimsQuant] ${details.subject}`,
                    },
                ],
                from: {
                    email: 'shiv.chawla@aimsquant.com',
                    name: 'Shiv Chawla',
                },
                content: [
                    {
                        type: 'text/html',
                        value: _t,
                    },
                ],
            },
        });

        sg.API(request, function(err, response) {
            if (err) {
                console.log('There was an error sending the email');
                return;
            }

            console.log('Email Sent');
        });
    });

    return;
};

