/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-08 14:01:19
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
const ContestHelper = require('../helpers/Contest');

const holidays = [
	"2018-08-22",
	"2018-09-13",
	"2018-09-20",
	"2018-10-02",
	"2018-10-18",
	"2018-11-07",
	"2018-11-08",
	"2018-11-23",
	"2018-12-25"
];

const indiaTimeZone = "Asia/Kolkata";

var marketCloseDatetime = moment("2018-01-01 15:30:00").tz(indiaTimeZone).local();
var marketCloseMinute = marketCloseDatetime.get('minute');
var marketCloseHour = marketCloseDatetime.get('hour');

//Run when seconds = 10
schedule.scheduleJob(`${marketCloseMinute+1}  ${marketCloseHour} * * 1-5`, function() {
    createNewContest();
});

function _isBeforeMarketClose(currentDatetime) {
	return (currentDatetime.get('hour') < 16 && currentDatetime.get('minute') < 30) || currentDatetime.get('hour') < 15;
}

function _nextNonHolidayWeekday(date) {
	var nextWeekday = DateHelper.getNextWeekday(date);
	
	let isHoliday = false;
	holidays.forEach(holiday => {
		isHoliday = isHoliday || DateHelper.compareDates(holiday, nextWeekday) == 0;
	});

	return isHoliday ? nextNonHolidayWeekday(nextWeekday) : nextWeekday;
}

function _getEffectiveContestDate(date) {
	var currentDatetimeIndia = moment(date).tz(indiaTimeZone);
	
	const weekday = currentDatetimeIndia.day();
	const isWeekDay = weekday > 0 && weekday < 6;

	var currentDate = DateHelper.getDate(date);

	let isHoliday = false;
	holidays.forEach(holiday => {
		isHoliday = isHoliday || DateHelper.compareDates(holiday, currentDate) == 0;
	});

	let _d;

	if ( _isBeforeMarketClose(currentDatetimeIndia) && isWeekDay && !isHoliday) {
		_d = DateHelper.getDate(date);
	} else {
		_d = _nextNonHolidayWeekday(date);
	}

	return moment(_d).set({hour: marketCloseHour, minute: marketCloseMinute}).tz(indiaTimeZone).local();
}

function createNewContest(date) {
	var startDate = _getEffectiveContestDate(date);
	var endDate = moment(startDate).add(1, 'day').tz(indiaTimeZone).local();

	const admins = config.get('admin_user');

	return UserModel.fetchUser({email:{$in: admins}}, {_id:1})
	.then(adminUser => {
		if (adminUser) {
			return DailyContestModel.fetchContest({startDate: startDate}, {_id:1})
			.then(existingContest => {
				if (existingContest) {
					APIError.throwJsonError({message: `Daily Contest already exists for ${startDate}`});
				} else {
					return DailyContestModel.saveContest({startDate: startDate, endDate: endDate, active: true, creator: adminUser._id});
				}
			})
		} else {
			APIError.throwJsonError({message: "Admin not found"});
		}
	});
}

module.exports.createDailyContest = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const admins = config.get('admin_user');
    const contest = args.body.value;
    const startDate = _.get(contest, 'startDate', DateHelper.getCurrentDate());

    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can create a contest
        	return createNewContest(startDate);    
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
	const date = _getEffectiveContestDate(_.get(args, 'date.value', DateHelper.getCurrentDate()));
	
	return DailyContestModel.fetchContest({startDate: date}, {fields:'startDate endDate winners netPortfolio'})
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
	const date = _getEffectiveContestDate(_.get(args, 'date.value', DateHelper.getCurrentDate()));
	const userId = _.get(args, 'user._id', null);

	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString()
			return DailyContestEntryModel.fetchEntryForDate({advisor: advisorId}, date)
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(contestEntry => {
		if (contestEntry) {
			return contestEntry.detail[0];
		} else {
			APIError.throwJsonError({message: `No contest entry foudn for ${date}`});
		}
		//Update the contest entry for price if required
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
	const contestDate = _getEffectiveContestDate();
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
					detail: [{
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
	const entryDate = _getEffectiveContestDate();
	let dailyContest, advisorId;

	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			advisorId = advisor._id.toString()
			return DailyContestEntryModel.fetchEntryForDate(
					{advisor: advisorId}, entryDate); 
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		} 
	})
	.then(existingEntry => {

		if (existingEntry) {
			var existingEntryDetail = existingEntry.detail[0];

			//Check if modified if less than 3 
			if (existingEntryDetail.modified < config.get('max_dailyentry_changes')) {
				const updates = {date: entryDate, positions: entryPositions};
				return DailyContestEntryModel.updateEntry({advisor: advisorId}, updates);
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
		//Update the contest entry for price if required
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











