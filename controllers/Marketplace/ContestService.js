'use strict';
const _ = require('lodash');
const config = require('config');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const ContestEntryModel = require('../../models/Marketplace/ContestEntry');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const ContestHelper = require('../helpers/Contest');
const APIError = require('../../utils/error');
const sendEmail = require('../../email');
const Promise = require('bluebird');

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
                    {fields: 'name startDate endDate entries'}
                );
            } else {
                APIError.throwJsonError({message: 'The duration of the contest should be more than 1 day'});
            }
        } else {
            APIError.throwJsonError({message: 'User is not allowed to create Contest'});
        }
    })
    .then(([contests, count]) => {
        if (count > 0) { // There is contest present before the one to be created
            // Getting the latest contest
            let latestContest = contests[count - 1];
            let activeEntries = latestContest.entries.filter(entry => entry.active === true);
            activeEntries = activeEntries.map(entry => {
                return {
                    ..._.pick(entry, ['entry', 'withDrawn', 'active', 'prohibited']),
                    rankingHistory: []
                }
            });
            return ContestModel.saveContest({...contest, creator: userId, entries: activeEntries});
        } else {
            return ContestModel.saveContest({...contest, creator: userId})
        }
    })
    .then(contest => {
        createdContest = contest;
        //This is required to compute the ranking of rolled over participants
        return ContestHelper.updateAnalytics(contest._id);
    })
    .then(contest => {
        res.status(200).send(_.pick(createdContest, ['name', 'active', 'startDate', 'endDate']));
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
    options.fields = 'name startDate endDate winners rules active';
    let query = {};
    // let query = {active: true};
    if (shouldGetValidContest) {
        query = {...query, active: true, startDate: {'$gte': currentDate}};
        
    }
    ContestModel.fetchContests(query, options)
    .then(([contests, count]) => {
        return res.status(200).send({contests, count});
    })
    .catch(err => {
        console.log(err);
        return res.status(400).send(err.message);
    });
}

module.exports.getAllContests = function(args, res, next) {
    const options = {};
    const active = _.get(args, 'active.value', 0);
    options.skip = _.get(args, 'skip.value', 0);
    options.limit = _.get(args, 'limit.value', 10);
    options.fields = 'name startDate endDate winners rules';
    options.populate = 'entry';
    let query = {};
    if (active === 1) {
        query = {active: true};
    } else if (active === -1) {
        query = {active: false};
    }

    ContestModel.fetchContests(query, options)
    .then(([contests, count]) => {
        return res.status(200).send({contests, count});
    })
    .catch(err => {
        console.log(err);
        return res.status(400).send(err.message);
    })
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

module.exports.getEntriesInContest = function(args, res, next) {
    const contestId = _.get(args, 'contestId.value', 0);
    const skip = _.get(args, 'skip.value', 0);
    const limit = _.get(args, 'limit.value', 10);
    const options = {};
    options.fields = 'name startDate endDate entries';
    options.populate = 'entry';
    options.entries = {skip,limit};
    ContestModel.fetchContest({_id: contestId}, options)
    .then(contest => {
        res.status(200).send(contest);
    })
    .catch(err => {
        res.status(400).send(err.message);
    })
}

module.exports.updateEntryStatusInContest = function(args, res, next) {
    const admins = config.get('admin_user');
    const userEmail = _.get(args, 'user.email', null);
    const userId = _.get(args, 'user._id', null);
    const entryId = _.get(args, 'entryId.value', 0);
    const operationType = _.get(args, 'type.value', 'add');
    const currentDate = DateHelper.getCurrentDate();
    
    let isAdmin, isOwner;
    let entryOwner;

    Promise.all([
        AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
        ContestEntryModel.fetchEntry({_id: entryId}, {fields: 'advisor', populate:'advisor'})
    ])
    .then(([advisor, entry]) => {
        if (!advisor) {
			APIError.throwJsonError({message:"Advisor not found"});
        }

        if (!entry) {
            APIError.throwJsonError({message:"Contest entry not found"});
        }


        isAdmin = admins.indexOf(userEmail) !== -1;
        isOwner = advisor && entry ? advisor._id.equals(entry.advisor._id) : false;

        entryOwner = _.get(entry, 'advisor.user', {});

        switch(operationType) {
            case "enter":
                if (isOwner) {
                    return ContestModel.insertEntryToContest(entryId)
                } else {
                    return APIError.throwJsonError({message: "Not authorized to enter the contest"});
                }
            case "withdraw":
                if (isOwner) {
                    return ContestModel.withdrawEntryFromContest({active: true, endDate: {'$gt': currentDate}}, entryId);
                } else {
                    return APIError.throwJsonError({message: "Not authorized to withdraw from contest"});
                }
            case "prohibit":
                if (isAdmin) {
                    return Promise.all([
                        ContestModel.prohibitEntryFromContest({active: true, endDate: {'$gt': currentDate}}, entryId),
                    ]);
                } else {
                    return APIError.throwJsonError({message: "Not authorized to prohibit entry from contest"});
                }
            default:
                return APIError.throwJsonError({message: 'Please choose a valid operation type'})
        }

    })
    .then(updatedContest => {
        var emailData = {
                        contestEntryUrl: `${config.get('hostname')}/contest/entry/${entryId}`,
                        leaderboardUrl: `${config.get('hostname')}/contest/leaderboard`,
                        updateContestEntryUrl: `${config.get('hostname')}/contest/updateentry/${entryId}`,
                        type: operationType
                    };
                            
        //Update the contest analytics
        ContestHelper.updateAnalytics(updatedContest._id);
        
        //Send an email
        sendEmail.sendContestStatusEmail(emailData, operationType == "prohibit" ? entryOwner : args.user);
        
        //Send response
        return res.status(200).send({message: `Successfully completed operation: ${operationType}`});
    })
    .catch(err => {
        return res.status(400).send(err.message);
    })
}

module.exports.getContestEntryRankSummaryInLatestContest = function(args, res, next) {
    const entryId = _.get(args, 'entryId.value', 0);
    ContestModel.fetchContests({active: true})
    .then(([contests, count]) => {
        const latestContest = contests[count -1];
        const contestId = _.get(latestContest, '_id', '').toString();
        const options = {};
        options.fields = 'entries';
        options.entries = {all: true, ignoreInactive: false};
        return ContestModel.fetchContest({_id: contestId}, options)
    })
    .then(contest => {
        const entries = _.get(contest, 'entries', []);
        // Get the entry which matches the entryId
        const entryIdx = _.findIndex(entries, entryItem => (entryItem.entry).toString() === entryId);
        if (entryIdx === -1) {
            APIError.throwJsonError({message: 'Contest entry is not present in this contest'});
        } else {
            res.status(200).send(entries[entryIdx]);
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
    .then(([contests, count]) => {
        return res.status(200).send({contests, count});
    })
    .catch(err => {
        return res.status(400).send(err.message);
    });
}

module.exports.getContestEntryRankSummaryInAllContests = function(args, res, next) {
    const entryId = _.get(args, 'entryId.value', '');
    return ContestHelper.getContestEntrySummary(entryId)
    .then(contests => {
        res.status(200).send(contests);
    })
    .catch(error => res.status(400).send(error));
}

module.exports.sendEmailToContestWinners = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const admins = config.get('admin_user');
    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can send email
            return ContestHelper.sendEmailToContestWinners();
        } else {
            APIError.throwJsonError({message: "User not authorized to send email"});
        }
    })
    .then(emailSent => {
        return res.status(200).send("Winner email sent");
    })
    .catch(error => { 
        return res.status(400).send(error.message)
    });
}