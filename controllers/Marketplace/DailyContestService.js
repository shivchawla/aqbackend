/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-09 17:40:50
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const schedule = require('node-schedule');
const moment = require('moment-timezone');

const config = require('config');
const sendEmail = require('../../email');
const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');

const UserModel = require('../../models/user');
const DailyContestModel = require('../../models/Marketplace/DailyContest');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestHelper = require('../helpers/DailyContest');
const DailyContestEntryHelper = require('../helpers/DailyContestEntry');

module.exports.createDailyContest = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const admins = config.get('admin_user');
    const contest = args.body.value;
    const startDate = _.get(contest, 'startDate', DateHelper.getCurrentDate());

    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can create a contest
        	return DailyContestHelper.createNewContest(startDate);    
        } else {
            APIError.throwJsonError({message: 'User is not allowed to create Contest'});
        }
    })
    .then(createdContest => {
        res.status(200).send(_.pick(createdContest, ['active', 'startDate', 'endDate']));
    })
    .catch(err => {
        res.status(400).send(err.message);
    })
};

module.exports.getDailyContest = (args, res, next) => {
	const date = DailyContestHelper.getEffectiveContestDate(_.get(args, 'date.value', DateHelper.getCurrentDate()));
	
	return DailyContestModel.fetchContest({startDate: date}, {fields:'startDate endDate winners'})
	.then(contest => {
		if (contest) {
			return res.status(200).send(contest);
		} else {
			APIError.throwJsonError({message: `No contest for ${date}`});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);	
	})
};

module.exports.getDailyContestEntry = (args, res, next) => {
	try {
	const date = DailyContestHelper.getEffectiveContestDate(_.get(args, 'date.value', DateHelper.getCurrentDate()));
	const userId = _.get(args, 'user._id', null);

	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString()
			return DailyContestEntryModel.fetchEntryPortfolioForDate({advisor: advisorId}, date)
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(contestEntry => {
		if (contestEntry) {
			//Update the contest entry for price and security detail - DONE
			return DailyContestEntryHelper.getUpdatedPortfolio(contestEntry.portfolioDetail[0]);
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${date}`});
		}
	})
	.then(updatedContestEntry => {
		return res.status(200).send(updatedContestEntry);
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
}catch(err) {
	console.log(err);
}
};

module.exports.createDailyContestEntry = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const entryPositions = args.body.value.positions;
	const contestDate = DailyContestHelper.getEffectiveContestDate();
	let dailyContest;

	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
		DailyContestModel.fetchContest({startDate: contestDate}, {fields: '_id'})
	])
	.then(([advisor, contest]) => {
		if (advisor && contest) {
			dailyContest = contest;

			const advisorId = advisor._id.toString()
			
			return DailyContestEntryModel.fetchEntry({advisor: advisorId}, {fields: '_id'})
			.then(contestEntry => {
				if (contestEntry) {
					APIError.throwJsonError({message: "Contest Entry already exists for the user"});
				}

				return DailyContestEntryModel.createEntry({
					advisor: advisorId, 
					modified: 1,
					portfolioDetail: [{
						positions: entryPositions, date: contestDate
					}]
				});
		
			});
		} else if (!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: "No active contest found"});
		}
	})
	.then(contestEntry => {
		//Now entery Contest
		return DailyContestModel.enterContest({_id: dailyContest._id}, contestEntry._id);
	})
	.then(contestEntered => {
		//Update the contest entry for price if required
		return DailyContestHelper.updateFinalPortfolio(contestDate, entryPositions);	
	})
	.then(final => {
		return res.status(200).send("Entry created and contest entered Successfully");
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

module.exports.updateDailyContestEntry = (args, res, next) => {
	try {
	
	const userId = _.get(args, 'user._id', null);
	const entryPositions = args.body.value.positions;
	const entryDate = DailyContestHelper.getEffectiveContestDate();
	let dailyContest, advisorId;

	let oldPositions;

	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			advisorId = advisor._id.toString()
			return DailyContestEntryModel.fetchEntryPortfolioForDate(
					{advisor: advisorId}, entryDate); 
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		} 
	})
	.then(existingEntry => {

		if (existingEntry) {
			var existingEntryDetail = existingEntry.portfolioDetail[0];

			//These are the old positions 
			//Used later to udpate final portfolio
			oldPositions = existingEntryDetail.positions;

			//Check if modified if less than 3 
			if (existingEntryDetail.modified < config.get('max_dailyentry_changes')) {
				const updates = {date: entryDate, positions: entryPositions};
				return DailyContestEntryModel.updateEntryPortfolio({advisor: advisorId}, updates);
			} else {
				APIError.throwJsonError({message: "Entry can't be modified anymore! 3 attempts are over!"});
			}
			
		} else {
			//If entry doesn't exit => entry date has alread passed
			//FE should avoid such cases
			//But in any case
			APIError.throwJsonError({message: "Deadline passed. Enter in New Contest"});  
		}
		
	})
	.then(entryUpdated => {
		//Now update the final portfolio (after change in entry)
		return DailyContestHelper.updateFinalPortfolio(entryDate, entryPositions, oldPositions);	
	})
	.then(fin => {
		return res.status(200).send("Entry updated successfully");
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
} catch(err) { 
	console.log(err);
}
};











