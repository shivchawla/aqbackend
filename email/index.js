'use strict';
const config = require('config');
var jade = require('jade');
var fs = require('fs');
const sgMail = require('@sendgrid/mail');
var hostname = config.get('hostname');
var truncate = require('truncate-html');
const _ = require('lodash');
const UserModel = require('../models/user');

var replaceAll = function(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}

sgMail.setApiKey(config.get('sendgrid_key'));
sgMail.setSubstitutionWrappers('{{', '}}'); 

function _sendMail(res, msg, obj) {
    sgMail.send(msg)
    .then(() => {

        if (obj && obj.redirectUrl) {
            res.redirect(obj.redirectUrl);
        }

        if (obj) {
            return res ? res.send(obj) : {};
        }

        return res ? res.status(200).send("Email Sent") : {}; 
    })
    .catch(error => {
        //Log friendly error
        console.error(error.toString());
        return res ? res.status(400).send('There was an error sending the email') : {};
    });
}

module.exports.sendActivationEmail = function(res, userDetails, source) {    
    
    var src = source ? source : "aimsquant";
    var activationTemplateId = config.get(`activation_email_template_id.${src}`);

    var senderDetails = config.get(`sender_details.${src}`);
    var userFullName = userDetails.firstName + ' '+userDetails.lastName;
    var code = userDetails.code;

    const msg = {
        to: [{
            email: userDetails.email,
            name:userFullName
        }],
        from: senderDetails,
        templateId: activationTemplateId,
        substitutions: {
            userFullName: userFullName,
            activationUrl: eval('`' + config.get(`account_activation_api_url.${src}`) + '`'),
        },
    };

    return _sendMail(res, msg, {email: userDetails.email, name: userFullName});
};

module.exports.resetSuccessEmail = function(res, userDetails, source) {
    
    var src = source ? source : "aimsquant";
    var resetPasswordTemplateId = config.get(`reset_password_template_id.${src}`);

    var senderDetails = config.get(`sender_details.${src}`);
    var userFullName = userDetails.firstName + ' '+userDetails.lastName;
    const msg = {
        to: [{
            email: userDetails.email,
            name:userFullName
        }],
        from: senderDetails,
        templateId: resetPasswordTemplateId,
        substitutions: {
            userFullName: userFullName,
            userEmailAddress: userDetails.email
        },
    };

    return _sendMail(res, msg);
};

module.exports.sendForgotEmail = function(res, userDetails, source) {

    var src = source ? source : "aimsquant";
    var resetPasswordTemplateId = config.get(`forgot_password_template_id.${src}`);

    var senderDetails = config.get(`sender_details.${src}`);
    var userFullName = userDetails.firstName + ' ' + userDetails.lastName;
    var code = userDetails.code;

    const msg = {
        to: [{
            email: userDetails.email,
            name:userFullName
        }],
        from: senderDetails,
        templateId: resetPasswordTemplateId,
        substitutions: {
            userFullName: userFullName,
            userEmailAddress: userDetails.email,
            resetPwdUrl: eval('`' + config.get(`reset_password_api_url.${src}`) + '`')
        },
    };

    return _sendMail(res, msg);

};

module.exports.welcomeEmail = function(res, userDetails, source) {
    
    var src = source ? source : "aimsquant";
    var WelcomeEmailTemplateId = config.get(`welcome_template_id.${src}`);

    var senderDetails = config.get(`sender_details.${src}`);
    var userFullName = userDetails.firstName + ' '+userDetails.lastName;
    const msg = {
        to: [{
            email: userDetails.email,
            name:userFullName
        }],
        from: senderDetails,
        templateId: WelcomeEmailTemplateId,
        substitutions: {
            userFullName: userFullName,
            userEmailAddress: userDetails.email,
        },
    };

    return _sendMail(res, msg, {redirectUrl: config.get(`activation_url.${src}`)});
};

module.exports.sendFeedbackEmail = function(res, args) {
    
    const msg = {
        to: args.body.value.to,
        from: args.body.value.from,
        subject: args.body.value.subject,
        html: args.body.value.feedback,
    };

    return _sendMail(res, msg);

};

module.exports.threadReplyEmail = function(threadDetails) {

    var replyUser = threadDetails.lastCommentedUser;
    var replyUserFullName = replyUser.firstName.trim() + ' ' + replyUser.lastName.trim();
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
            var followerFullName = follower.firstName.trim() +' '+ follower.lastName.trim();
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
        var receiverFullName = receiver.firstName.trim() + ' ' + receiver.lastName.trim();
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

/*
* Email to notify advice status
*/
module.exports.sendAdviceStatusEmail = function(adviceDetails, userDetails) {    
    
    var senderDetails = config.get(`sender_details.adviceqube`);
    var userFullName = userDetails.firstName + ' ' + userDetails.lastName;
    var adviceName = adviceDetails.name;
    var adviceUrl = `${config.get('hostname')}/advice/${adviceDetails.adviceId}`;

    let adviceStatusTemplateId;

    if (adviceDetails.pending) {
        adviceStatusTemplateId = config.get(`advice_request_approval_template_id`);
    } else if (!adviceDetails.status) {
        adviceStatusTemplateId = config.get(`advice_rejection_template_id`);
    } else {
        adviceStatusTemplateId = config.get(`advice_approval_template_id`);
    }

    const msg = {
        to: [{
            email: userDetails.email,
            name: userFullName
        }],
        from: senderDetails,
        templateId: adviceStatusTemplateId,
        substitutions: {
            userFullName: userFullName,
            adviceName: adviceDetails.name,
            adviceUrl: adviceUrl
        },
    };

    return sgMail.send(msg);
};

/*
* Email to notify contest participants
*/
module.exports.sendContestStatusEmail = function(contestEntryDetails, userDetails) {    
    
    var senderDetails = config.get(`sender_details.adviceqube`);
    var userFullName = userDetails.firstName + ' ' + userDetails.lastName;
    var {contestName, contestEntryUrl, updateContestEntryUrl, leaderboardUrl, type} = contestEntryDetails;
    
    let contestEntryStatusTemplateId; 

    if (type == "enter") {
        contestEntryStatusTemplateId = config.get(`contest_entry_successful_template_id`);
    } else if (type == "withdraw") {
        contestEntryStatusTemplateId = config.get(`contest_entry_withdrawal_template_id`);
    } else if (type == "prohibit") {
        contestEntryStatusTemplateId = config.get(`contest_entry_removal_template_id`);
    } else if (type == "update") {
        contestEntryStatusTemplateId = config.get(`contest_entry_update_template_id`);
    }

    const msg = {
        to: [{
            email: userDetails.email,
            name: userFullName
        }],
        from: senderDetails,
        templateId: contestEntryStatusTemplateId,
        substitutions: {
            userFullName: userFullName,
            //contestName: contestName,
            contestEntryUrl: contestEntryUrl,
            leaderboardUrl: leaderboardUrl,
            updateContestEntryUrl: updateContestEntryUrl
        },
    };

    return sgMail.send(msg);
};


module.exports.sendPerformanceDigest = function(performanceDetail, userDetails) {
   const userFullName = userDetails.firstName+' '+userDetails.lastName;
   const msg = {
            to: [{
                email: userDetails.email,
                name: userFullName
            }],
            from: {name: "AdviceQube", email:"contest@adviceqube.com"},
            templateId: config.get('contest_daily_performance_digest_template_id'),
            substitutions: {
                userFullName,
                ...performanceDetail
            },
        };

        return _sendMail({}, msg);
}

module.exports.sendEmail = function(req, res, next) {
    console.log("Aquiii");
    const to = _.get(req.body.value ,'to', null);
    const from = _.get(req.body.value ,'from', null);
    const text = _.get(req.body.value ,'text', null);
    const template = _.get(req.body.value ,'template', null);

    Promise.resolve()
    .then(() => {
        if (!to) {
            APIError.jsonError({messsage: "TO address is invalid"});
        } else {
            return UserModel.fetchUser({email: to});
        }
    })
    .then(userDetails => {
        if (!text && !template) {
            APIError.jsonError({messsage: "Body or template not valid"})
        }

        const userFullName = userDetails.firstName + ' ' + userDetails.lastName;

        if (template) {
           const msg = {
                to: [{
                    email: userDetails.email,
                    name: userFullName
                }],
                from: {name: "AdviceQube", email:"contest@adviceqube.com"},
                templateId: template,
                substitutions: {
                    userFullName: userFullName,
                    ticker1:"A",
                    lastPrice1:"2.56",
                    dailyPnl1:"32.56",
                    totalPnl1:"32.56",
                    weight1:"13.45%",
                    color_dp_1: "red",
                    color_tp_1: "green"
                },
            };

            console.log(msg);

            return _sendMail(res, msg);
        }
    })
    .catch(err => {
        console.log("FCUK");
        console.log(err);
        res.status(400).send(err.messsage);
    })

}

