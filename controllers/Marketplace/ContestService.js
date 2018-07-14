'use strict';
const _ = require('lodash');
const config = require('config');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const AdviceModel = require('../../models/Marketplace/Advice');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const APIError = require('../../utils/error');

//Use only res.status() once for each 200/400
//Dnt use moment here..use DateHelper
//Use APIError to throw errors
module.exports.createContest = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const admins = config.get('admin_user');
    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1) { // user is admin and can create a contest
            const contest = args.body.value;
            const startDate = _.get(contest, 'startDate', DateHelper.getCurrentDate());
            const endDate = _.get(contest, 'endDate', DateHelper.getCurrentDate());
            const duration = DateHelper.compareDates(endDate, startDate);
            // const duration = endDate.diff(startDate, 'days');
            if (duration === 1) { // The contest is of valid duration
                return ContestModel.saveContest({...contest, creator: userId})
            } else {
                APIError.throwJsonError({message: 'The duration of the contest should be more than 1 day'});
            }
        } else {
            APIError.throwJsonError({message: 'User is not allowed to create Contest'});
        }
    })
    .then(contest => {
        return res.status(200).send(contest);
    })
    .catch(err => {
        return res.status(400).send(err.message);
    })
}


//ADD projections here, we don't need to fetch al info about the contest
module.exports.getContests = function(args, res, next) {
    const options = {};
    options.skip = _.get(args, 'skip.value', 0);
    options.limit = _.get(args, 'limit.value', 10);
    options.fields = 'name startDate endDate winners rules';
    ContestModel.fetchContests({active: true}, options)
    .then(({contests, count}) => {
        return res.status(200).send({contests, count});
    })
    .catch(err => {
        return res.status(400).send(err.message);
    });
}

//Can we pre-defined a set of fields when none is provided (use projections)
module.exports.getContestSummary = function(args, res, next) {
    const contestId = _.get(args, 'contestId.value', 0);
    const options = {};
    options.fields = 'name startDate endDate winners rules advices advices';
    options.populate = 'advice';
    ContestModel.fetchContest({_id: contestId}, options)
    .then(contest => {
        res.status(200).send(contest);
    })
    .catch(err => {
        res.status(400).send(err.message);
    });
}

// //Call it updateAdviceInContest
// module.exports.updateAdviceInContest = function(args, res, next) {
//     console.log('Called modify Advice in Contest');
//     const admins = config.get('admin_user');
//     //Shouldn' it be _.get(args, 'user.email', null);
//     //What if it's null
module.exports.updateAdviceInContest = function(args, res, next) {
    const admins = config.get('admin_user');
    const userEmail = _.get(args, 'user.email', null);
    const userId = _.get(args, 'user._id', null);
    const adviceId = _.get(args, 'adviceId.value', 0);
    const contestId = _.get(args, 'contestId.value', 0);
    const operationType = _.get(args, 'type.value', 'add');
    Promise.all([
        AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
        AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'advisor'})
    ])
    .then(([advisor, advice]) => {
        if (!advisor) {
			APIError.throwJsonError({message:"Advisor not found"});
        }

        if (!advice) {
            APIError.throwJsonError({message:"Advice not found"});
        }

        const isAdmin = admins.indexOf(userEmail) !== -1;
        const isOwner = advisor && advice ? advisor._id.equals(advice.advisor) : false;

        switch(operationType) {
            case "enter":
                if (isOwner) {
                    //Are we still using reference t Advice Model?
                    return ContestModel.insertAdviceToContest({_id: contestId}, adviceId)
                    .then(contest => {
                        return AdviceModel.updateAdvice({_id: adviceId}, {$addToSet: {contests: {
                            contestId: contest._id,
                            ranking: [{rank: 0, date: new Date()}]
                        }}})
                    })
                } else {
                    return APIError.throwJsonError({message: "Not authorized to enter the contest"});
                }
            case "withdraw":
                if (isOwner) {
                    return ContestModel.withdrawAdviceFromContest({_id: contestId}, adviceId);
                } else {
                    return APIError.throwJsonError({message: "Not authorized to withdraw from contest"});
                }
            case "prohibit":
                if (isAdmin) {
                    return ContestModel.prohibitAdviceFromContest({_id: contestId}, adviceId);
                } else {
                    return APIError.throwJsonError({message: "Not authorized to prohibit advice from contest"});
                }
            default:
                return APIError.throwJsonError({message: 'Please choose a valid operation type'})
        }

    })
    .then(data => {
        return res.status(200).send({data});
    })
    .catch(err => {
        return res.status(400).send(err.message);
    })
}
