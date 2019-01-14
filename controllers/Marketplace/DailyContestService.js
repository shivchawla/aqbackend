/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-01-02 11:01:11
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const schedule = require('node-schedule');
const moment = require('moment-timezone');
var path = require('path');
var fs = require('fs');
var csv = require('fast-csv');

const config = require('config');
const sendEmail = require('../../email');
const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');

const UserModel = require('../../models/user');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestEntryHelper = require('../helpers/DailyContestEntry');
const DailyContestHelper = require('../helpers/DailyContest');
const DailyContestStatsHelper = require('../helpers/DailyContestStats');
const SecurityHelper = require('../helpers/Security');
/* 
* Get contest entry for a date
*/
module.exports.getDailyContestPredictions = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	const date = DateHelper.getMarketCloseDateTime(_dd);
	const category = _.get(args, 'category.value', 'all');
	const userId = _.get(args, 'user._id', null);
	const advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	let advisorSelection = {user: userId};
	if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
		advisorSelection = {_id: advisorId};
	}

	return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString();
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category});
		} else if(!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: `No Contest found for ${date}`});
		}
	})
	.then(updatedPredictions => {
		if (updatedPredictions) {
			return res.status(200).send(updatedPredictions);
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${date}`});
		}
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

/* 
* Get contest entry pnl-stats for a date
*/
module.exports.getDailyContestPnlForDate = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);
	
	const category = _.get(args, 'category.value', 'all');
	const userId = _.get(args, 'user._id', null);
	const advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	let advisorSelection = {user: userId};
	if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
		advisorSelection = {_id: advisorId};
	}

	return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString();

			return DailyContestEntryHelper.getPnlStatsForDate(advisorId, date, category);
		} else if(!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: `No Contest found for ${date}`});
		}
	})
	.then(updatedContestEntryPnl => {
		if (updatedContestEntryPnl) {
			return res.status(200).send(updatedContestEntryPnl);
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${_d}`});
		}
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

/* 
* Get contest entry portfolio-stats for a date
*/
module.exports.getDailyContestPortfolioStatsForDate = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);
	
	const userId = _.get(args, 'user._id', null);
	const advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	let advisorSelection = {user: userId};
	if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
		advisorSelection = {_id: advisorId};
	}

	return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString();
			return Promise.all([
				DailyContestEntryHelper.getPortfolioStatsForDate(advisorId, date),
				AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: 'account'})
			]);
		} else if(!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: `No Contest found for ${date}`});
		}
	})
	.then(([portfolioStats, advisor]) => {
		if (portfolioStats) {
			return res.status(200).send(portfolioStats);
		} else if (advisor) {
			var advisorAccount = advisor ? _.get(advisor.toObject(), 'account', {}) : {};
			return res.status(200).send({...advisorAccount, netTotal: _.get(advisorAccount, 'cash', 0), netEquity: 0});
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${_d}`});
		}
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

/*
* Next availble stock without prediction
*/
module.exports.getDailyContestNextStock = function(args, res, next) {

	let date = DailyContestEntryHelper.getValidStartDate();
	
	const search = _.get(args, 'search.value', null)
	const sector = _.get(args, 'sector.value', null);
	const industry = _.get(args, 'industry.value', null);
	const universe = _.get(args, 'universe.value', "NIFTY_500");

	const exclude = _.get(args, 'exclude.value', "").split(",").map(item => item.trim());
	const populate = _.get(args, 'populate.value', false);

	const userId = _.get(args, 'user._id', null);

	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString()

			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate:false});
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		} 
	})
	.then(activePredictions => {
		var activeTickers = (activePredictions || []).map(item => _.get(item, 'position.security.ticker', ""));
		
		return SecurityHelper.getStockList(search, {universe, sector, industry, exclude: activeTickers.concat(exclude), limit:1})
			.then(securities => {
			return Promise.map(securities, function(security) {
				return populate ? 
					SecurityHelper.getStockLatestDetail(security).then(detail => {return Object.assign(security, detail)}) : 
					security;
			});
		})
	})
	.then(possibleTickers => {
		return res.status(200).send(possibleTickers);
	})
	.catch(err => {
		return res.status(400).send({messge: err.message});	
	})
};

/*
* Update predictions for the contest
*/
module.exports.updateDailyContestPredictions = (args, res, next) => {
	
	const userId = _.get(args, 'user._id', null);
	let advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	const entryPredictions = args.body.value.predictions;
	const action = args.operation.value;

	let validStartDate = DailyContestEntryHelper.getValidStartDate();

	return Promise.resolve()
	/*.then(() => {
		if (!DateHelper.isMarketTrading()) {
			APIError.throwJsonError({message: "Market is closed!"})
		}
	})*/
	.then(() => {
		//Check if investment amount is either 10, 25, 50, 75 or 100K
		return Promise.map(entryPredictions.map(item => {return _.get(item, 'position.investment');}), function(investment) {
			return [10, 25, 50, 75, 100].indexOf(Math.abs(investment)) !=- 1;
		})
		.then(validInvestments => {
			var valid = true;

			validInvestments.forEach(v => {
				valid = valid && v;
			});

			if(!valid) {
				APIError.throwJsonError({message: "Invalid investment value"});
			} else{
				return true;
			}
		});

	})
	.then(() => {
		return Promise.map(entryPredictions, function(prediction) {
			return SecurityHelper.getStockLatestDetail(prediction.position.security)
			.then(securityDetail => {
				var latestPrice = _.get(securityDetail, 'latestDetailRT.current', 0) || _.get(securityDetail, 'latestDetail.Close', 0);
				if (latestPrice != 0) {
					const investment = prediction.position.investment;
					const target = prediction.target;
					const stopLoss = -Math.abs(_.get(prediction, 'stopLoss', 1));

					if (stopLoss == 0) {
						APIError.throwJsonError({message: "Stoploss must be non-zero"});
					} else if (Math.abs(stopLoss) > 1) {
						APIError.throwJsonError({message: "Stoploss must be less than 100"});
					} 

					if (investment > 0 && target < 1.015*latestPrice) {
						APIError.throwJsonError({message:`Long Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 1.5% higher than call price`});
					} else if (investment < 0 && target > 1.015*latestPrice) {
						APIError.throwJsonError({message:`Short Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 1.5% lower than call price`});
					}
					return;
				} else {
					console.log("Create Prediction: Price not found");
					return; 
				}
			})
		})
	})
	.then(() => {
		let advisorSelection = {user: userId};
		if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
			advisorSelection = {_id: advisorId};
		}
		return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id account'})
	})
	.then(advisor => {
		if (advisor) {
			advisorId = advisor._id.toString();
			var liquidCash = _.get(advisor, 'account.liquidCash', 0);

			var investmentRequired = 0;

			entryPredictions.forEach(item => {
				investmentRequired += Math.abs(_.get(item, 'position.investment', 0));
			});

			if (liquidCash < investmentRequired) {
				APIError.throwJsonError({message: `Insufficient funds to create predictions.`});
			}
			
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, validStartDate, {category: "all", priceUpdate: false});
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(activePredictions => {

		return Promise.map(entryPredictions, function(prediction) {
			var ticker = _.get(prediction, 'position.security.ticker', "");
			var existingPredictionsInTicker = activePredictions.filter(item => {return item.position.security.ticker == ticker;});
			var newPredictioninTicker = entryPredictions.filter(item => {return item.position.security.ticker == ticker;});

			if (existingPredictionsInTicker.length + newPredictioninTicker.length > 3) {
				APIError.throwJsonError({message: `Limit exceeded: Can't add more than 3 prediction for one stock (${ticker})`});
			}

			return; 
		})
	})
	.then(() => {
		
		//Change this to use PROMISE 
		//And check redundancy of predictions
		var adjustedPredictions = entryPredictions.map(item => {
			if (DateHelper.compareDates(item.endDate, item.startDate) == 1) {
				
				item.startDate = DailyContestEntryHelper.getValidStartDate(item.startDate);
				item.endDate = DateHelper.getMarketCloseDateTime(DateHelper.getNextNonHolidayWeekday(item.endDate, 0));
				item.active = true;
				item.modified = 1;
				item.stopLoss = -Math.abs(_.get(item, 'stopLoss', 1));
				item.nonMarketHoursFlag = DateHelper.isHoliday() || !DateHelper.isMarketTrading();
				item.createdDate = new Date();

				return item;

			} else {
				console.log("Invalid prediction");
				return null;
			}
		}).filter(item => item);

		return DailyContestEntryHelper.addPredictions(advisorId, adjustedPredictions, DateHelper.getMarketCloseDateTime(validStartDate)); 
		
	})
	.then(final => {
		return res.status(200).send("Predictions updated successfully");
	})
	.catch(err => {
		return res.status(400).send(err.message);		
	});
};

module.exports.exitDailyContestPrediction = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const predictionId = _.get(args, 'predictionId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	let advisorId = _.get(args, 'advisorId.value', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	
	Promise.resolve()
	.then(() => {
		if(!DateHelper.isMarketTrading()) {
			APIError.throwJsonError({message: "Can't exit - Market is closed"});
		} else {
			return;
		}
	})
	.then(() => {
		let advisorSelection = {user: userId};
		if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
			advisorSelection = {_id: advisorId};
		}
		return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id'})	
	})
	.then(advisor => {
		if (advisor) {
			advisorId = advisor._id.toString();
			var date = DateHelper.getMarketCloseDateTime();
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false});
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(allActivePredictions => {
		var idx = allActivePredictions.findIndex(item => {return item._id.toString() == predictionId;});
		if (idx != -1) {

			var prediction = allActivePredictions[idx];
			prediction.status.manualExit = true;
			prediction.status.trueDate = new Date();
			prediction.status.date = DateHelper.getMarketCloseDateTime(new Date());

			return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction);

		} else {
			APIError.throwJsonError({message: "Prediction not found"});
		}
	})
	.then(() => {
		return DailyContestEntryHelper.updateLatestPortfolioStatsForAdvisor(advisorId);
	})
	.then(() => {
		return res.status(200).send("Prediction exited successfully");
	})
	.catch(err => {
		return res.status(400).send(err.message);		
	});
};


function _populateWinners(winners) {
	return Promise.map(winners, function(winner) {
		return AdvisorModel.fetchAdvisor({_id: winner.advisor}, {fields: 'user'})
		.then(populatedAdvisor => {
			return {...winner.toObject(), user: populatedAdvisor.user.toObject()};
		})
	})
}

/*
* Get daily contest winners
*/
module.exports.getDailyContestWinners = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);

	return DailyContestStatsModel.fetchContestStats(date, {fields:'dailyWinners weeklyWinners'})
	.then(statsForDate => {
		return Promise.all([
			_populateWinners(statsForDate.dailyWinners || []),
			_populateWinners(statsForDate.weeklyWinners || [])
		]);
	})
	.then(([populatedDailyWinners, populatedWeeklyWinners]) => {
		return res.status(200).send({dailyWinners: populatedDailyWinners, weeklyWinners: populatedWeeklyWinners});
	})
	.catch(err => {
		return res.status(400).send({message: err.message});	
	})
};

/**
 * Get overall contest winners
 */
module.exports.getDailyContestOverallWinners = (args, res, next) => {
	const query = {$and: [{dailyWinners: {$exists: true}}, {'dailyWinners.0': {$exists: true}}]};
	const resultFilePath = path.dirname(require.main.filename);

	return DailyContestStatsModel.fetchAllContestStats(query)
	.then(stats => {
		let requiredWinners = [];
		// Flattening all the winners
		stats.map(stat => {
			const requiredStat = stat.toObject();
			requiredWinners = [...requiredWinners, ...requiredStat.dailyWinners];
		});
		// Group all the winners by advisorId
		const overallWinners = _.groupBy(requiredWinners, winner => winner.advisor._id);
		// Getting all the advisorIds
		const advisors = Object.keys(overallWinners);
		// Getting all the earnings of the advisor
		let winnerArray = advisors.map(advisor => {
			const totalEarnings = _.sum(overallWinners[advisor].map(item => getPrizeValue(item.rank)));
			console.log(overallWinners[advisor][0]);
			const firstName = overallWinners[advisor][0].advisor.user.firstName;
			const lastName = overallWinners[advisor][0].advisor.user.lastName;
			const name = `${firstName} ${lastName}`;
			return {advisor, totalEarnings, name};
		});
		// Ordering all the advisors based on their total earnings
		winnerArray = _.orderBy(winnerArray, 'totalEarnings', 'desc');
		// Writing the winners to csv files
		// writeWinnersToCsv(`${resultFilePath}/examples/winners.csv`, winnerArray);
		
		return res.status(200).send({winners: winnerArray});
	})
	.catch(err => {
		return res.status(400).send({message: err.message});
	})
}

module.exports.getDailyContestOverallWinnersByEarnings = (args, res, next) => {
	const resultFilePath = path.dirname(require.main.filename);

	return DailyContestEntryPerformanceModel.fetchDistinctPerformances({})
	.then(performances => {
		const winners = performances.map(performance => {
			// performance = performance.toObject();
			let firstName = _.get(performance, 'advisor.user.firstName', '');
			let lastName = _.get(performance, 'advisor.user.lastName', '');
			firstName = firstName[0].toUpperCase() + firstName.slice(1).toLowerCase();
			lastName = lastName[0].toUpperCase() + lastName.slice(1).toLowerCase();
			const userName = `${firstName} ${lastName}`;
			const dailyEarnings = _.get(performance, 'totalDaily', 0);
			const weeklyEarnings = _.get(performance, 'totalWeekly', 0);
			const totalEarnings = dailyEarnings + weeklyEarnings;

			return {name: userName, dailyEarnings, weeklyEarnings, totalEarnings};
		});
		writeWinnersToCsv(`${resultFilePath}/examples/winners.csv`, winners);

		return res.status(200).send(winners);
	})
	.catch(err => {
		return res.status(400).send({message: err.message});
	})
}

/*
* Get daily contest top stocks
*/
module.exports.getDailyContestTopStocks = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);

	return DailyContestStatsModel.fetchContestStats(date, {fields:'topStocks'})
	.then(statsForDate => {
		var topStocksByUsers = _.get(statsForDate, 'topStocks.byUsers', []);
		var topStocksByInvestment = _.get(statsForDate, 'topStocks.byInvesment', []);

		return Promise.all([
			Promise.map(topStocksByInvestment, function(topStock) {
				return SecurityHelper.getStockLatestDetail({ticker: topStock.ticker})
				.then(securityDetail => {
					delete topStock.ticker;
					return {...topStock, security: securityDetail};
				})	
			}),
			Promise.map(topStocksByUsers, function(topStock) {
				return SecurityHelper.getStockLatestDetail({ticker: topStock.ticker})
				.then(securityDetail => {
					delete topStock.ticker;
					return {...topStock, security: securityDetail};
				})	
			})
		]);
	})
	.then(([updatedTopStockByInvestment, updatedTopStockByUsers]) => {
		return res.status(200).send({byUsers: updatedTopStockByUsers, byInvestment: updatedTopStockByInvestment});
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send({message: err.message});	
	})
};

/*
* Get contest (dashboard stats) for user
*/
module.exports.getDailyContestStats = (args, res, next) => {
	const category = _.get(args, 'category.value', "general");
	const symbol = _.get(args, 'symbol.value', null);
	const horizon = _.get(args, 'horizon.value', null);
	const advisor = _.get(args, 'advisor.value', null);
	const userId = _.get(args, 'user._id', null);

	return Promise.resolve()
	.then(() => {
		if (symbol && horizon) {

			APIError.throwJsonError({message: "Only one of symbol/horizon parameter is allowed"})
		} else {
			let selection = {user: userId};
			
			if (advisor !== null && (advisor || '').trim().length > 0) {
				selection = {_id: advisor.trim()};
			}
			return AdvisorModel.fetchAdvisor({...selection}, {fields: '_id'})		
		}
	})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString()
			switch(category) {
				case "general" : return DailyContestEntryHelper.getDailyContestEntryPnlStats(advisorId, symbol, horizon); 
				case "prediction" : return DailyContestEntryHelper.getDailyContestEntryPnlStats(advisorId, symbol, horizon); break;
				case "pnl" : return DailyContestEnteryHelper.getDailyContestEntryPnlStats(advisorId, horizon); break;
			}
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		} 
	})	
	.then(stats => {
		return res.status(200).send(stats);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

module.exports.updateDailyContestTopStocks = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);

	const admins = config.get('admin_user');
    Promise.resolve(true)
    .then(() => {
    	const userEmail = _.get(args.user, 'email', null);

        if (admins.indexOf(userEmail) !== -1){ // user is admin and can send email
            return DailyContestStatsHelper.updateContestTopStocks(date);
        } else {
            APIError.throwJsonError({message: "User not authorized to update top-stocks"});
        }
    })
    .then(() => {
    	return res.status(200).send({message: "Top stocks updated"});
    })
};

module.exports.updateDailyContestPnlForDate = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);

	const admins = config.get('admin_user');
    Promise.resolve(true)
    .then(() => {
    	const userEmail = _.get(args.user, 'email', null);
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can send email
            return DailyContestStatsHelper.updateContestStats(date);
        } else {
            APIError.throwJsonError({message: "User not authorized to update pnl stats"});
        }
    })
    .then(() => {
    	return res.status(200).send({message: "Pnl Stats Updated"});
    })
};

module.exports.sendEmailToDailyContestWinners = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const admins = config.get('admin_user');
    const date = _.get(args, 'date.value', null);

    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can send email
            return DailyContestStatsHelper.sendDailyWinnerDigest(date);
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
};

module.exports.sendSummaryEmailToParticipants = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const date = _.get(args, 'date.value', null);

    const admins = config.get('admin_user');
    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can send email
            return DailyContestStatsHelper.sendSummaryDigest(date);
        } else {
            APIError.throwJsonError({message: "User not authorized to send email"});
        }
    })
    .then(emailSent => {
        return res.status(200).send("Contest summary/digest sent");
    })
    .catch(error => { 
        return res.status(400).send(error.message)
    });
};

module.exports.sendTemplateEmailToParticipants = function(args, res, next) {
    const userId = args.user._id;
    const userEmail = _.get(args.user, 'email', null);
    const emailType = _.get(args, 'emailType.value', "all");

    const admins = config.get('admin_user');
    
    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can send email
            return DailyContestStatsHelper.sendTemplateEmailToParticipants(emailType);
        } else {
            APIError.throwJsonError({message: "User not authorized to send email"});
        }
    })
    .then(emailSent => {
        return res.status(200).send("Contest Participants template sent");
    })
    .catch(error => { 
        return res.status(400).send(error.message)
    });
};

const getPrizeValue = (rank = 1) => {
	switch(rank){
        case 1:
            return 100;
        case 2:
            return 75;
        case 3:
            return 50;
        default:
            return 0;  
    }
}

const writeWinnersToCsv = (path, winners) => {
	const csvStream = csv
		.createWriteStream({headers: true})
		.transform(function(row, next){
			setImmediate(function(){
				// this should be same as the object structure
				next(null, {
					Name: row.name, 
					Earnings: row.totalEarnings
					// Daily: row.dailyEarnings, 
					// Weekly: row.weeklyEarnings
				});
			});;
		});
	const writableStream = fs.createWriteStream(path);		
	writableStream.on("finish", function(){
		console.log("Written to file");
	});
	csvStream.pipe(writableStream);
	winners.map(winner => {
		csvStream.write(winner);
	});
	csvStream.end();
}

