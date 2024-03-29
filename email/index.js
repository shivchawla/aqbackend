'use strict';
const config = require('config');
var jade = require('jade');
var fs = require('fs');
const sgMail = require('@sendgrid/mail');
var hostname = config.get('hostname');
var truncate = require('truncate-html');
const _ = require('lodash');
const UserModel = require('../models/user');
const Promise = require('bluebird');

const {sendElasticEmail} = require('./elastic');

var replaceAll = function(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}

sgMail.setApiKey(config.get('sendgrid_key'));
sgMail.setSubstitutionWrappers('{{', '}}'); 

function _sendMail(res, msg, obj) {
    return sgMail.send(msg)
    .then(() => {

        if (obj && obj.redirectUrl) {
           res ? res.redirect(obj.redirectUrl) : {};
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
    var userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));

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
    var userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
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
    var userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
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

module.exports.welcomeEmail = function(res, userDetails, source, redirect = true) {
    
    var src = source ? source : "aimsquant";
    var WelcomeEmailTemplateId = config.get(`welcome_template_id.${src}`);

    var senderDetails = config.get(`sender_details.${src}`);
    var userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
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
    const redirectUrl = redirect
            ? config.get(`activation_url.${src}`)
            : null;

    return _sendMail(res, msg, {redirectUrl});
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
    var homeUrl = config.get('research_hostname');
    var postUrl = `${homeUrl}/community/${threadDetails._id}`;
    var threadId = threadDetails._id;
    var unsubscribeUrl = eval('`' + config.get('request_thread_unsubscribe_url') + '`');
    
    var substitutions = {
        replyUserFullName,
        postTitle: threadDetails.title,
        postFirstLine: truncate(threadDetails.markdownText, {length: 300, excludes: 'img'}),
        postUrl,
        unsubscribeUrl
    };

    var slicedTitle = threadDetails.title.slice(0, 60); 

    return Promise.map(threadDetails.followers, function(follower) {
        if(threadDetails.lastCommentedUser._id != follower._id) {
            var followerFullName = follower.firstName.trim() +' '+ follower.lastName.trim();
           
            const msg = {
                to: [{
                    email: follower.email
                }],
                from: {
                    email: 'no-reply@adviceqube.com',
                    name:`${replyUserFullName}`,
                },
                templateId:config.get('community_reply_thread_template_id'),
                subject: `Comment:[AdviceQube] ${slicedTitle}`,
                substitutions: {...substitutions, followerFullName}
            };
            
            return sgMail.send(msg);
        }
    });
};

/*
* Send information email based on text-body
*/
module.exports.sendInfoEmail = function(details) {
 
    var receivers = details.receivers;
    var templateFileName = details.templateFileName;
    var template = fs.readFileSync(__dirname + `/../views/${templateFileName}`).toString();
    var homeLink = config.get('hostname');
    template = template.replace(/homeLink/g, homeLink);
 
    receivers.forEach(receiver => {
        var receiverFullName = receiver.firstName.trim() + ' ' + receiver.lastName.trim();
        var _t = template.replace('receiverFullName', receiverFullName);
        const msg = {
            to: [{
                email:receiver.email,
            }],
            from: {
                email: 'shiv.chawla@aimsquant.com',
                name: 'Shiv Chawla',
            },
            bodyHtml: _t,
            subject: `[AimsQuant] ${details.subject}`
        };

        return sgMail.send(msg);
        
    });

 };


/*
* Send information email based on template
*/
module.exports.sendTemplateEmail = function(templateId, substitutions, receiver, sender) {
    var senderDetails = config.get(`sender_details.${sender}`);
    
    var userFullName = _.startCase(_.toLower(receiver.firstName + ' ' + receiver.lastName));
    const msg = {
        to: [{
            email: receiver.email,
            name: userFullName
        }],
        from: senderDetails,
        templateId: templateId,
        substitutions: {
            userFullName,
            ...substitutions
        },
    };

    return sgMail.send(msg);
    
};


/*
* Email to notify advice status
*/
module.exports.sendAdviceStatusEmail = function(adviceDetails, userDetails) {    
    receiver.firstName + ' ' + receiver.lastName;
    var senderDetails = config.get(`sender_details.adviceqube`);
    var userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
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
    var userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
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

    return sgMail.send(msg);
};

module.exports.sendContestWinnerEmail = function(winnerDetail, userDetails) {
   const userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
   const msg = {
            to: [{
                email: userDetails.email,
                name: userFullName
            }],
            from: {name: "AdviceQube", email:"contest@adviceqube.com"},
            templateId: config.get('contest_winner_template_id'),
            substitutions: {
                userFullName,
                ...winnerDetail
            },
        };

    return sgMail.send(msg);
};

module.exports.sendDailyContestSummaryDigest = function(summaryDigest, userDetails) {
   const userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
   const msg = {
            to: [{
                email: userDetails.email,
                name: userFullName
            }],
            from: {name: "AdviceQube", email:"contest@adviceqube.com"},
            templateId: config.get('dailycontest_summary_digest_template_id'),
            substitutions: {
                userFullName,
                ...summaryDigest
            },
        };

    return sgMail.send(msg);
};

module.exports.sendDailyContestWinnerEmail = function(winnerDetail, userDetails, weekly = false) {
   const userFullName = _.startCase(_.toLower(userDetails.firstName + ' '+userDetails.lastName));
   const msg = {
            to: [{
                email: userDetails.email,
                name: userFullName
            }],
            from: {name: "AdviceQube", email:"contest@adviceqube.com"},
            templateId: weekly ? config.get('dailycontest_week_winner_template_id') : config.get('dailycontest_day_winner_template_id'),
            substitutions: {
                userFullName,
                ...winnerDetail
            },
        };

    return sgMail.send(msg);
}

