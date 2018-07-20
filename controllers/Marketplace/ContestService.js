'use strict';
const _ = require('lodash');
const config = require('config');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const AdviceModel = require('../../models/Marketplace/Advice');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const ContestHeper = require('../helpers/Contest');
const APIError = require('../../utils/error');
const sendEmail = require('../../email');

module.exports.createContest = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const admins = config.get('admin_user');
    const contest = args.body.value;
    const startDate = _.get(contest, 'startDate', DateHelper.getCurrentDate());
    const endDate = _.get(contest, 'endDate', DateHelper.getCurrentDate());
    const duration = DateHelper.compareDates(endDate, startDate);
    let createdContest = null;
    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can create a contest
            if (duration === 1) { // The contest is of valid duration
                // Get the contest before the one to be created
                return ContestModel.fetchContests(
                    {active: true, startDate: {$lt: startDate}}, 
                    {fields: 'name startDate endDate advices'}
                );
            } else {
                APIError.throwJsonError({message: 'The duration of the contest should be more than 1 day'});
            }
        } else {
            APIError.throwJsonError({message: 'User is not allowed to create Contest'});
        }
    })
    .then(({contests, count}) => {
        if (count > 0) { // There is contest present before the one to be created
            // Getting the latest contest
            let latestContest = contests[count - 1];
            let activeAdvices = latestContest.advices.filter(advice => advice.active === true);
            activeAdvices = activeAdvices.map(advice => {
                return {
                    ..._.pick(advice, ['advice', 'withDrawn', 'active', 'prohibited']),
                    rankingHistory: []
                }
            });
            return ContestModel.saveContest({...contest, creator: userId, advices: activeAdvices});
        } else {
            return ContestModel.saveContest({...contest, creator: userId})
        }
    })
    .then(contest => {
        createdContest = contest;
        return ContestHeper.updateAnalytics(contest._id);
    })
    .then(contest => {
        res.status(200).send(_.pick(createdContest, ['name', 'active', 'startDate', 'endDate']));
        // return contest;
    })
    .catch(err => {
        res.status(400).send(err.message);
    })
}

module.exports.updateContest = function(args, res, next) {
    const admins = config.get('admin_user');
    const userEmail = _.get(args, 'user.email', null);
    const contestId = _.get(args, 'contestId.value', 0);
    const contestBody = args.body.value;
    const isAdmin = admins.indexOf(userEmail) !== -1;
    Promise.resolve(true)
    .then(() => {
        if (isAdmin) {
            return ContestModel.updateContest({_id: contestId}, {$set: contestBody}, {new: true, fields: 'name startDate endDate active'})
        } else {
            APIError.throwJsonError({message: 'Not authorized to update contest'});
        }
    })
    .then(contest => {
        res.status(200).send(contest);
    })
    .catch(err => {
        res.status(400).send(err);
    });
}

module.exports.getContests = function(args, res, next) {
    const currentDate = DateHelper.getCurrentDate();
    const options = {};
    const shouldGetValidContest = _.get(args, 'current.value', false);
    options.skip = _.get(args, 'skip.value', 0);
    options.limit = _.get(args, 'limit.value', 10);
    options.fields = 'name startDate endDate winners rules';
    let query = {active: true};
    if (shouldGetValidContest) {
        query = {...query, startDate: {'$gt': currentDate}};
        
    }
    ContestModel.fetchContests(query, options)
    .then(({contests, count}) => {
        return res.status(200).send({contests, count});
    })
    .catch(err => {
        console.log(err);
        return res.status(400).send(err.message);
    });
}

module.exports.getContestSummary = function(args, res, next) {
    const contestId = _.get(args, 'contestId.value', 0);
    const options = {};
    options.fields = 'name startDate endDate winners rules active';
    ContestModel.fetchContest({_id: contestId}, options)
    .then(contest => {
        res.status(200).send(contest);
    })
    .catch(err => {
        console.log(err);
        res.status(400).send(err.message);
    });
}

module.exports.getContestAdvices = function(args, res, next) {
    const contestId = _.get(args, 'contestId.value', 0);
    const skip = _.get(args, 'skip.value', 0);
    const limit = _.get(args, 'limit.value', 10);
    const options = {};
    options.fields = 'name startDate endDate advices';
    options.populate = 'advice';
    options.advices = {skip,limit};
    ContestModel.fetchContest({_id: contestId}, options)
    .then(contest => {
        res.status(200).send(contest);
    })
    .catch(err => {
        res.status(400).send(err.message);
    })
}

module.exports.updateAdviceInContest = function(args, res, next) {
    const admins = config.get('admin_user');
    const userEmail = _.get(args, 'user.email', null);
    const userId = _.get(args, 'user._id', null);
    const adviceId = _.get(args, 'adviceId.value', 0);
    const operationType = _.get(args, 'type.value', 'add');
    
    let isAdmin, isOwner;
    let adviceOwner;

    Promise.all([
        AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
        AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'advisor', populate:'advisor'})
    ])
    .then(([advisor, advice]) => {
        if (!advisor) {
			APIError.throwJsonError({message:"Advisor not found"});
        }

        if (!advice) {
            APIError.throwJsonError({message:"Advice not found"});
        }


        isAdmin = admins.indexOf(userEmail) !== -1;
        isOwner = advisor && advice ? advisor._id.equals(advice.advisor._id) : false;

        adviceOwner = _.get(advice, 'advisor.user', {});

        switch(operationType) {
            case "enter":
                if (isOwner) {
                    return ContestModel.insertAdviceToContest(adviceId)
                } else {
                    return APIError.throwJsonError({message: "Not authorized to enter the contest"});
                }
            case "withdraw":
                if (isOwner) {
                    return ContestModel.withdrawAdviceFromContest({active: true}, adviceId);
                } else {
                    return APIError.throwJsonError({message: "Not authorized to withdraw from contest"});
                }
            case "prohibit":
                if (isAdmin) {
                    return Promise.all([
                        ContestModel.prohibitAdviceFromContest({active: true}, adviceId),
                        // AdviceModel.prohibitAdvice({_id: adviceId})
                    ]);
                } else {
                    return APIError.throwJsonError({message: "Not authorized to prohibit advice from contest"});
                }
            default:
                return APIError.throwJsonError({message: 'Please choose a valid operation type'})
        }

    })
    .then(data => {
        var emailData = {
                        contestEntryUrl: `${config.get('hostname')}/contest/entry/${adviceId}`,
                        leaderboardUrl: `${config.get('hostname')}/contest/leaderboard`,
                        updateContestEntryUrl: `${config.get('hostname')}/contest/updateadvice/${adviceId}`,
                        type: operationType
                    };
                            ;
        return Promise.all([data, sendEmail.sendContestStatusEmail(emailData, operationType == "prohibit" ? adviceOwner : args.user)]);
    })
    .then(([data, emailSent]) => {
        return res.status(200).send({message: `Successfully completed operation: ${operationType}`});
    })
    .catch(err => {
        return res.status(400).send(err.message);
    })
}

module.exports.getAdviceSummary = function(args, res, next) {
    const adviceId = _.get(args, 'adviceId.value', 0);
    ContestModel.fetchContests({active: true})
    .then(({contests, count}) => {
        const latestContest = contests[count -1];
        const contestId = _.get(latestContest, '_id', '').toString();
        const options = {};
        options.fields = 'advices';
        options.advices = {all: true, ignoreInactive: false};
        return ContestModel.fetchContest({_id: contestId}, options)
    })
    .then(contest => {
        const advices = _.get(contest, 'advices', []);
        // Get the advice which matches the adviceId
        const adviceIdx = _.findIndex(advices, adviceItem => (adviceItem.advice).toString() === adviceId);
        if (adviceIdx === -1) {
            APIError.throwJsonError({message: 'Advice is not present in this contest'});
        } else {
            res.status(200).send(advices[adviceIdx]);
        }   
    })
    .catch(err => {
        res.status(400).send(err.message);
    });
}

module.exports.getValidContestsToParticipate = function(args, res, next) {
    const options = {};
    options.fields = 'name startDate endDate';
    const currentDate = DateHelper.getCurrentDate();
    ContestModel.fetchContests({active: true, startDate: {'$gt': currentDate}})
    .then(({contests, count}) => {
        return res.status(200).send({contests, count});
    })
    .catch(err => {
        return res.status(400).send(err.message);
    });
}