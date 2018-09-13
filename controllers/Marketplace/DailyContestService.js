/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-11 17:43:26
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

/*
* Create new contest for a start date
* A contest is generally created automatically(this API is for manual creation)
*/
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

/*
* Get current active contest based on date - DONE
*/
module.exports.getDailyContest = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const date = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);

	return DailyContestHelper.getContestForDate(
		date, 
		{
			fields:'startDate endDate resultDate winners topStocks active',
			populate: 'winners'
		}
	)
	.then(contest => {
		if (contest) {
			return res.status(200).send(contest);
		} else {
			APIError.throwJsonError({message: `No contest for ${date}`});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);	
	});
};

/* 
* Get contest entry for a date
*/
module.exports.getDailyContestEntry = (args, res, next) => {
	
	const _d = _.get(args, 'date.value', '');
	const date = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);

	const userId = _.get(args, 'user._id', null);

	let contestEndDate;
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
		DailyContestHelper.getContestForDate(date, {fields: '_id startDate endDate'})
	])
	.then(([advisor, contest]) => {
		if (advisor && contest) {

			let contestEndDate = contest.endDate;
			const advisorId = advisor._id.toString()

			return DailyContestEntryModel.fetchEntryPortfolioForDate({advisor: advisorId}, contestEndDate)
		} else if(!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: `No Contest found for ${date}`});
		}
	})
	.then(contestEntry => {
		if (contestEntry) {
			//Update the contest entry for price and security detail - DONE
			return DailyContestEntryHelper.getUpdatedPortfolio(contestEntry.portfolioDetail[0]);
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${_d}`});
		}
	})
	.then(updatedContestEntry => {
		return res.status(200).send(updatedContestEntry);
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

/*
* Create new contest entry for the current contest (if any)
*/
module.exports.createDailyContestEntry = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const entryPositions = args.body.value.positions;
	
	let dailyContest, contestStartDate, contestEndDate, advisorId;
	let alreadyExists = false;

	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
		DailyContestHelper.getContestForDate(DateHelper.getCurrentDate(), {fields: 'startDate endDate'})
	])
	.then(([advisor, contest]) => {
		if (advisor && contest) {
			dailyContest = contest;
			contestStartDate = contest.startDate;
			contestEndDate = contest.endDate;
			advisorId = advisor._id.toString();
			
			return DailyContestEntryModel.fetchEntry({advisor: advisorId}, {fields: '_id'})
		} else if (!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: "No active contest found"});
		}
	})
	.then(contestEntry => {
		if (contestEntry) {
			const updates = {date: contestEndDate, positions: entryPositions};

			return DailyContestEntryModel.updateEntryPortfolio({advisor: advisorId}, updates, {new:true, fields:'_id'});
			//APIError.throwJsonError({message: "Contest Entry already exists for the user"});
		} else{

			return DailyContestEntryModel.createEntry({
				advisor: advisorId, 
				modified: 1,
				portfolioDetail: [{
					positions: entryPositions, date: contestEndDate
				}]
			});
		}

	})
	.then(contestEntry => {
		console.log('Daily Contest', dailyContest);
		console.log('Contest Entry', contestEntry);
		//Now entery Contest
		return DailyContestModel.enterContest({_id: dailyContest._id}, contestEntry._id);
		
	})
	.then(contestEntered => {
		//Update the contest entry for price if required
		return DailyContestHelper.updateFinalPortfolio(contestStartDate, entryPositions);	
	})
	.then(final => {
		return res.status(200).send("Entry created and contest entered Successfully");
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

/*
* Update contest entry for the current contest (if any)
*/
module.exports.updateDailyContestEntry = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const entryPositions = args.body.value.positions;
	let dailyContest, advisorId, contestStartDate, contestEndDate;

	let oldPositions;

	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
		DailyContestHelper.getContestForDate(DateHelper.getCurrentDate(), {fields: 'startDate endDate'})
	])
	.then(([advisor, contest]) => {
		if (advisor && contest) {
			advisorId = advisor._id.toString()
			contestStartDate = contest.startDate;
			contestEndDate = contest.endDate;

			return DailyContestEntryModel.fetchEntryPortfolioForDate(
					{advisor: advisorId}, contestEndDate); 
		} else if (!advisor){
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: "Not active contest found"});
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
				const updates = {date: contestEndDate, positions: entryPositions};
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
		return DailyContestHelper.updateFinalPortfolio(contestStartDate, entryPositions, oldPositions);	
	})
	.then(fin => {
		return res.status(200).send("Entry updated successfully");
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

//THIS IS BETTER TIMING TO HANDLE
//Start date - When submisison starts
//End date - When submission ends
//Result Date - When results are declared

/*
	Calendar date - 11th September 
	Starts - 11th Market Open
	Ends - 11th Market Close
	Results declared - 12th Market Close
	Show your choice of stocks
	PnL Job - Runs for contest where resultDate is today
*/

/*
	Calendar date - 12th September 
	Starts - 12th Market Open
	Ends -  12th Market Close
	Show your choice of stocks
	Results declared - on 13th or next business day 
*/

/*
	Calendar date - Now (9th Night)
	Shows timer to upcoming contest tomorrow morning
	Starts - 10th Market Open
	Ends - 10th Market Close
	Show your choice of stocks/Ability 
	Results declared - on 11th 
*/
