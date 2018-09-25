/*
* @Author: Shiv Chawla
* @Date:   2018-09-08 15:47:32
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-25 18:14:19
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const schedule = require('node-schedule');
const moment = require('moment-timezone');

const config = require('config');
const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');
const sendEmail = require('../../email');

const UserModel = require('../../models/user');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestModel = require('../../models/Marketplace/DailyContest');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');

const DailyContestEntryHelper = require('./DailyContestEntry');
const SecurityHelper = require('./Security');

const indiaTimeZone = "Asia/Kolkata";

var marketOpenDatetime = moment("2018-01-01 09:30:00").tz(indiaTimeZone).local();
var marketOpenMinute = marketOpenDatetime.get('minute');
var marketOpenHour = marketOpenDatetime.get('hour');

var marketCloseDatetime = moment("2018-01-01 15:30:00").tz(indiaTimeZone).local();
var marketCloseMinute = marketCloseDatetime.get('minute');
var marketCloseHour = marketCloseDatetime.get('hour');

//Run when seconds = 10
schedule.scheduleJob(`${marketCloseMinute+1}  ${marketCloseHour} * * 1-5`, function() {
    exports.createNewContest();
});

module.exports.getContestSpecificDateTime = function(date) {
	moment(date).tz(indiaTimeZone).set({hour: marketCloseHour, minute: marketCloseMinute}).local();
};

function _isBeforeMarketClose(currentDatetime) {
	return (currentDatetime.get('hour') < 16 && currentDatetime.get('minute') < 30) || currentDatetime.get('hour') < 15;
}

function _isBeforeMarketOpen(currentDatetime) {
	return (currentDatetime.get('hour') < 10 && currentDatetime.get('minute') < 30) || currentDatetime.get('hour') < 9;
}

module.exports.getEffectiveContestDate = function(date) {
	return moment(date).tz(indiaTimeZone).set({hour: marketOpenHour, minute: marketOpenMinute}).local();
}

module.exports.getStartDateForNewContest = function(date) {
	var datetimeIndia = (date ? moment(new Date(date)) : moment()).tz(indiaTimeZone);
	var currentDatetimeIndia = moment().tz(indiaTimeZone);

	let _tentativeStartDatetime;
	if (currentDatetimeIndia > datetimeIndia) {
		_tentativeStartDatetime = currentDatetimeIndia
	} else {
		_tentativeStartDatetime = datetimeIndia;
	}
	
	const weekday = _tentativeStartDatetime.get('day');
	const isWeekDay = weekday > 0 && weekday < 6;

	let isHoliday = DateHelper.IsHoliday(date);

	let _finalStartDate;
	if ( _isBeforeMarketOpen(_tentativeStartDatetime) && isWeekDay && !isHoliday) {
		_finalStartDate = DateHelper.getDate(_tentativeStartDatetime);
	} else {
		_finalStartDate = DateHelper.getNextNonHolidayWeekday(_tentativeStartDatetime.toDate());
	}

	return moment(_finalStartDate).tz(indiaTimeZone).set({hour: marketOpenHour, minute: marketOpenMinute}).local();
};

module.exports.getEndDateForNewContest = function(date) {
	var startdate = exports.getStartDateForNewContest(date);
	return moment(startdate).tz(indiaTimeZone).set({hour: marketCloseHour, minute: marketCloseMinute}).local();
};

module.exports.getResultDateForNewContest = function(date) {
	var contestEndDate = exports.getEndDateForNewContest(date);
	//Reslt date is one trading after the close of contest
	var _next = DateHelper.getNextNonHolidayWeekday(contestEndDate.toDate());
	return moment(_next).tz(indiaTimeZone).set({hour: marketCloseHour, minute: marketCloseMinute}).local();	
};

module.exports.getContestForDate = function(date, options) {
	//Map the passed date to exchange(contest) start time
	const effectiveDatetime =  exports.getEffectiveContestDate(date);
	return DailyContestModel.fetchContest({startDate: effectiveDatetime}, options);	
};

module.exports.createNewContest = function(date) {
	
	//Contest starts at market OPEN 
	//Contest ends at market CLOSE
	var startDate = exports.getStartDateForNewContest(date);
	var endDate = exports.getEndDateForNewContest(date);
	
	//Contest ENDS 1 trading after the contest close date
	var resultDate = exports.getResultDateForNewContest(date);

	const admins = config.get('admin_user');

	return UserModel.fetchUser({email:{$in: admins}}, {_id:1})
	.then(adminUser => {
		if (adminUser) {
			return DailyContestModel.fetchContest({startDate: startDate}, {_id:1})
			.then(existingContest => {
				if (existingContest) {
					APIError.throwJsonError({message: `Daily Contest already exists for ${startDate}`});
				} else {
					return DailyContestModel.saveContest({
						startDate: startDate, 
						endDate: endDate, 
						resultDate: resultDate, 
						active: true, 
						creator: adminUser._id});
				}
			})
		} else {
			APIError.throwJsonError({message: "Admin not found"});
		}
	});
};

module.exports.updateFinalPortfolio = function(date, newPositions, oldPositions) {
	return DailyContestModel.fetchContest({startDate: date}, {fields: 'totalPositions'})
	.then(contest => {
		if (contest) {
			var totalPositions = _.get(contest, 'totalPositions', []);
			newPositions.filter(newItem => {
				var idx = totalPositions.findIndex(item => {return item.security.ticker == newItem.security.ticker});
				
				if (idx !=-1) {
					totalPositions[idx].netInvestment += newItem.investment;
					totalPositions[idx].longInvestment += newItem.investment > 0 ? newItem.investment : 0;
					totalPositions[idx].shortInvestment += newItem.investment < 0 ? newItem.investment : 0;
					totalPositions[idx].numUsers ++;
				} else {
					totalPositions.push({...newItem, numUsers: 1});
				}

			});

			//Now get rid of old positions (if olo positions in not null)

			if (oldPositions) {
				oldPositions.filter(oldItem => {
					var idx = totalPositions.findIndex(item => {return item.security.ticker == oldItem.security.ticker});
					
					if (idx !=-1) {
						totalPositions[idx].netInvestment -= oldItem.investment;
						totalPositions[idx].longInvestment -= oldItem.investment > 0 ? oldItem.investment : 0;
						totalPositions[idx].shortInvestment -= oldItem.investment < 0 ? oldItem.investment : 0;
						totalPositions[idx].numUsers--;
					} else {
						console.log("OOPS!! Old Position not found! This should not happen");
					}
				});
			}

			return DailyContestModel.updateContest({startDate: date}, {totalPositions: totalPositions});

		} else {
			APIError.throwJsonError({message: "Contest not found. Fina portfolio could not be updated"});
		}
	});
};

module.exports.getContestWithResultToday = function(options) {
	const datetimeIndia = moment(DateHelper.getCurrentDate()).tz(indiaTimeZone).set({hour: marketCloseHour, minute: marketCloseMinute}).local();	
	return DailyContestModel.fetchContest({resultDate: datetimeIndia, active: true}, options);
};

module.exports.getContestWithEndDateToday = function(options) {
	const datetimeIndia = moment(DateHelper.getCurrentDate()).tz(indiaTimeZone).set({hour: marketCloseHour, minute: marketCloseMinute}).local();	
	return DailyContestModel.fetchContest({endDate: datetimeIndia, active: true}, options);
};

module.exports.updateAllEntriesPnlStats = function(){
	//Find all active entries for today
	return exports.getContestWithResultToday({fields:'_id entries endDate', entries: {all: true}})
	.then(contest => {
		if (contest) {

			var allEntries = contest.entries;

			//Pnl is mapped to the end date of entry
			let entryDate = contest.endDate;
			return Promise.mapSeries(allEntries, function(entry) {
				return DailyContestEntryHelper.updateContestEntryPnlStats(entry, entryDate);
			});
		} else {
			APIError.throwJsonError({message: "No contest with result date today"})
		}
	})
	.catch(err => {
		console.log(err.message);
	});
};

module.exports.updateDailyTopPicks = function() {
	//Find all active entries for today
	let lastActiveContestId;
	return exports.getContestWithEndDateToday({field:'_id entries endDate totalPositions', entries: {all: true}})
	.then(contest => {
		if (contest) {
			lastActiveContestId = contest._id;
			var allEntries = contest.entries;
			let entryDate = contest.endDate;
			let totalPositions = contest.totalPositions.toObject();

			
			return Promise.mapSeries(totalPositions, function(position) {
				return SecurityHelper.getStockLatestDetail(position.security)
				.then(securityDetail => {
					position.security.detail = securityDetail.detail;
					position.lastDetail = securityDetail.latestDetail
					return position;
				})
			})
		} else {
			APIError.throwJsonError({message: "No contest with end date today"})
		}
	})
	.then(populatedTotalPositions => {

		var topStocks = populatedTotalPositions.sort((a,b) => {
			return a.numUsers > b.numUsers ? -1 : a.numUsers == b.numUsers ? 0 : 1;
		}).slice(0, 5).map(item => {
			return _.pick(item, ['security', 'numUsers', 'lastDetail']);
		});

		return DailyContestModel.updateContest({_id: lastActiveContestId}, {topStocks: topStocks}, {new: true, fields:'topStocks'});
	})
	.catch(err => {
		console.log(err.message);
	})
};

module.exports.updateDailyContestWinners = function() {
	//Find all active entries for today
	let lastActiveContestId;
	return exports.getContestWithResultToday({field:'_id entries endDate totalPositions', entries: {all: true}})
	.then(contest => {
		if (contest) {
			lastActiveContestId = contest._id;
			var allEntries = contest.entries;
			let entryDate = contest.endDate;
			let totalPositions = contest.totalPositions.toObject();

			return Promise.all([
				//P1
				Promise.mapSeries(allEntries, function(entry) {
					return DailyContestEntryHelper.getContestEntryDailyPnlStats(entry, entryDate);
				}),
				//P2 - update and set the entry for date to be incactive
				Promise.mapSeries(allEntries, function(entry) {
					return DailyContestEntryHelper.getUpdatedContestEntry(entry, entryDate)
					.then(updatedContestEntry => {
						const updates = {date: entryDate, positions: updatedContestEntry.positions, active: false};
						return DailyContestEntryModel.updateEntryPortfolio({_id: entry}, updates);
					})
				}),
			]);
		} else {
			APIError.throwJsonError({message: "No contest with result date today"})
		}
	})
	.then(([pnlStatsAllAdvisors, x]) => {

		let i = 1;
		
		var winners = pnlStatsAllAdvisors.sort((a,b) => {
			return a.pnlStats.totalPnl > b.pnlStats.totalPnl ? -1 : a.pnlStats.totalPnl == b.pnlStats.totalPnl ? 0 : 1; 
		}).slice(0, 3).map(item => {
			item.rank = i++;
			return item;
		});

		return DailyContestModel.updateContest({_id: lastActiveContestId}, {winners: winners, active: false}, {new: true, fields:'winners topStocks'});
	})
	.then(updatedContest => {
		if (updatedContest) {
			let winners = updatedContest.winners;
			let topStocks = updatedContest.topStocks;
			let dailyContestUrl = `${config.get('hostname')}/dailycontest/${lastActiveContestId}/leaderboard`;
			
			return Promise.mapSeries(winners, function(winner){
				return AdvisorModel.fetchAdvisor({_id: winner.advisor}, {insert: true})
				.then(advisor => {
					if (advisor.user && process.env.NODE_ENV === 'production') {
						console.log("No Daily winners");
						//return sendEmail.sendDailyContestWinnerEmail({dailycontestUrl}, advisor.user);
					} else {
						console.log("Virtual email sent in development");
					}
				});
			});	
		}
	})
	.catch(err => {
		console.log(err.message);
	})
};

module.exports.updateWeeklyTopPicks = function() {
	return exports.getContestWithEndDateToday({endDate:1, startDate:1})
	.then(contestEndingToday => {
		if (contestEndingToday){
			//Get the endDate of this contest	
			var endDate = contestEndingToday.endDate;
			var startDate = contestEndingToday.startDate;

			var datesInWeekOfThisContest = DateHelper.getDatesInWeek(endDate);
			let totalPositions_weekly = [];

			return Promise.mapSeries(datesInWeekOfThisContest, function(date) {
				var _d = DateHelper.getMarketClose(date);

				return DailyContestModel.fetchContest({endDate: _d}, {totalPositions:1})
				.then(contest => {
					if (contest) {
						var totalPositions_daily = _.get(contest, 'totalPositions', []);

						totalPositions_daily.forEach(item => {
							var ticker = item.security.ticker;

							var idx = totalPositions_weekly.map(item => _.get(item, 'security.ticker', '')).indexOf(ticker);
							if (idx!=-1) {

								var _rollingWeeklyTotalPosition = Object.asssign({}, totalPositions_weekly[idx]);

								_rollingWeeklyTotalPosition.netInvestment += item.netInvestment;
								_rollingWeeklyTotalPosition.longInvestment += item.longInvestment;
								_rollingWeeklyTotalPosition.shortInvestment += item.shortInvestment;
								_rollingWeeklyTotalPosition.numUsers += item.numUsers;

								totalPositions_weekly[idx]  = _rollingWeeklyTotalPosition;
							} else {
								totalPositions_weekly.push(item);
							}

						});

						return totalPositions_weekly;
						
					} else {
						return null;
					}
				})
				.then(weeklyPositions => {
					if(weeklyPositions) {
						return DailyContestModel.updateContest({endDate: _d}, {totalPositions_weekly: weeklyPositions});
					} else {
						null;
					}	
				});	
			})
			.then(contestIds => {
				//Update all daily contest for the last week with winners 
				//on First Trading Day of next week
				//and tops picks
				var nextWeekDay = DateHelper.getNextNonHolidayWeekday(endDate);

				//If the week is ending today
				if (moment(endDate).get('week') < moment(nextWeekDay).get('week')) {//

					//Logic to compute weekly winners based on 
					//get contest with endDate
					return exports.getContestForDate(startDate, {field:'_id entries endDate totalPositions_weekly', entries: {all: true}})
					.then(contest => {
						if (contest) {
							//lastActiveContestId = contest._id;
							var allEntries = contest.entries;
							let entryDate = contest.endDate;
							let totalPositions = contest.totalPositions_weekly.toObject();

							
							return Promise.mapSeries(totalPositions, function(position) {
								return SecurityHelper.getStockLatestDetail(position.security)
								.then(securityDetail => {
									position.security.detail = securityDetail.detail;
									position.lastDetail = securityDetail.latestDetail
									return position;
								})
							})
							.then(populatedTotalPositions => {

								var topStocks = populatedTotalPositions.sort((a,b) => {
									return a.numUsers > b.numUsers ? -1 : a.numUsers == b.numUsers ? 0 : 1;
								}).slice(0, 5).map(item => {
									return _.pick(item, ['security', 'numUsers', 'lastDetail']);
								});

								return Promise.map(contestIds, function(contestId) {
									if (contestId) {
										return DailyContestModel.updateContest({_id: contestId}, {topStocks_weekly: topStocks}, {new: true, fields:'topStocks'});
									}
								});

							});
						}
					})				
				} else {
					console.log("Week is not over yet!!");
				}
			});
		}
	})
	.catch(err => {
		console.log(err);
	});
};

module.exports.updateWeeklyContestWinners = function() {
	return exports.getContestWithResultToday({endDate:1, startDate:1})
	.then(contestResultToday => {
		if (contestResultToday){
			//Get the endDate of this contest	
			var endDate = contestResultToday.endDate;
			var startDate = contestResultToday.startDate;

			var datesInWeekOfThisContest = DateHelper.getDatesInWeek(endDate);
			let totalPositions_weekly = [];


			return Promise.mapSeries(datesInWeekOfThisContest, function(date) {
				var _d = DateHelper.getMarketClose(date);

				return DailyContestModel.fetchContest({endDate: _d}, {totalPositions:1})
				.then(contest => {
					if (contest) {
						var totalPositions_daily = _.get(contest, 'totalPositions', []);

						totalPositions_daily.forEach(item => {
							var ticker = item.security.ticker;

							var idx = totalPositions_weekly.map(item => _.get(item, 'security.ticker', '')).indexOf(ticker);
							if (idx!=-1) {

								var _rollingWeeklyTotalPosition = Object.asssign({}, totalPositions_weekly[idx]);

								_rollingWeeklyTotalPosition.netInvestment += item.netInvestment;
								_rollingWeeklyTotalPosition.longInvestment += item.longInvestment;
								_rollingWeeklyTotalPosition.shortInvestment += item.shortInvestment;
								_rollingWeeklyTotalPosition.numUsers += item.numUsers;

								totalPositions_weekly[idx]  = _rollingWeeklyTotalPosition;
							} else {
								totalPositions_weekly.push(item);
							}

						});

						return totalPositions_weekly;
						
					} else {
						return null;
					}
				})
				.then(weeklyPositions => {
					if(weeklyPositions) {
						return DailyContestModel.updateContest({endDate: _d}, {totalPositions_weekly: weeklyPositions});
					} else {
						null;
					}	
				});	
			})
			.then(contestIds => {
				//Update all daily contest for the last week with winners 
				//on First Trading Day of next week
				//and tops picks
				
				if (moment(endDate).get('week') < moment().get('week')) {//

					//Logic to compute weekly winners based on 
					//get contest with endDate
					return exports.getContestForDate(startDate, {field:'_id entries endDate totalPositions_weekly', entries: {all: true}})
					.then(contest => {
						if (contest) {
							//lastActiveContestId = contest._id;
							var allEntries = contest.entries;
							let entryDate = contest.endDate;
							let totalPositions = contest.totalPositions_weekly.toObject();

							return Promise.mapSeries(allEntries, function(entry) {
								return DailyContestEntryModel.fetchEntryPnlStatsForWeek({_id: entry}, entryDate)
								.then(contestEntry => {
									if (_.get(contestEntry, 'performance.weekly', null) && contestEntry.performance.weekly.length > 0) {
										return {advisor: contestEntry.advisor, pnlStats: contestEntry.performance.weekly[0].pnlStats};
									}
								});
							})
							.then(pnlStatsAllAdvisors => {
								let i = 1;
		
								var winners = pnlStatsAllAdvisors.sort((a,b) => {
									return a.pnlStats.totalPnl > b.pnlStats.totalPnl ? -1 : a.pnlStats.totalPnl == b.pnlStats.totalPnl ? 0 : 1; 
								}).slice(0, 3).map(item => {
									item.rank = i++;
									return item;
								});

								return Promise.map(contestIds, function(contestId) {
									if (contestId) {
										return DailyContestModel.updateContest({_id: contestId}, {winners_weekly: winners}, {new: true, fields:'winners_weekly'});
									}
								});

							});
						}
					})				
				} else {
					console.log("Week is not over yet!!");
				}
			});
		}
	})
	.catch(err => {
		console.log(err);
	});
};