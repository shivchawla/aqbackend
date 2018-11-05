/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-05 13:25:48
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
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');
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

	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString()

			return DailyContestEntryModel.fetchEntry({advisor: advisorId}, {fields: '_id'})
		} else if(!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: `No Contest found for ${date}`});
		}
	})
	.then(contestEntry => {
		if (contestEntry) {
			return DailyContestEntryHelper.getPredictionsForDate(contestEntry._id, date, category);
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${date}`});
		}
	})
	.then(updatedContestEntry => {
		if (updatedContestEntry) {
			return res.status(200).send(updatedContestEntry);
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${date}`});
		}
	})
	.catch(err => {
		//console.log(err);
		return res.status(400).send(err.message);		
	});
};

/* 
* Get contest entry for a date
*/
module.exports.getDailyContestPnl = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);

	const category = _.get(args, 'category.value', 'all');
	const userId = _.get(args, 'user._id', null);

	return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString()

			return DailyContestEntryModel.fetchEntry({advisor: advisorId}, {fields: '_id'})
		} else if(!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: `No Contest found for ${date}`});
		}
	})
	.then(contestEntry => {
		if (contestEntry) {
			return DailyContestEntryHelper.getPnlForDate(contestEntry._id, date, category);
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${_d}`});
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
		//console.log(err);
		return res.status(400).send(err.message);		
	});

};

/*
* Update predictions for the contest
*/
module.exports.updateDailyContestPredictions = (args, res, next) => {
	
	const userId = _.get(args, 'user._id', null);
	const entryPredictions = args.body.value.predictions;
	const action = args.operation.value;
	
	let advisorId;
	return Promise.resolve()
	.then(() => {
		return true;
		if (DateHelper.isMarketTrading()) {
			return true;
		} else {
			APIError.throwJsonError({msg: "Market is currently closed"});
		}
	})
	.then(() => {
		return Promise.map(entryPredictions, function(prediction) {
			return SecurityHelper.getStockLatestDetail(prediction.position.security)
			.then(securityDetail => {
				var latestPrice = _.get(securityDetail, 'latestDetailRT.current', 0) || _.get(securityDetail, 'latestDetail.Close', 0);
				if (latestPrice != 0) {
					const investment = prediction.position.investment;
					const target = prediction.target;

					if (investment > 0 && target < 1.02*latestPrice) {
						APIError.throwJsonError({msg:`Long Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 2% higher than call price`});
					} else if (investment < 0 && target > 1.02*latestPrice) {
						APIError.throwJsonError({msg:`Short Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 2% lower than call price`});
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
		return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})
	})
	.then(advisor => {
		if (advisor) {
			advisorId = advisor._id.toString();
			
			return DailyContestEntryModel.fetchEntry({advisor: advisorId}, {fields: '_id'})
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(contestEntry => {
		if (contesEntry) {
			return DailyContestEntryHelper.getPredictionsForDate(contestEntry._id, DateHelper.getMarketCloseDateTime(), "started", false)
			.then(predictionsToday => {
				if (predictionsToday.length + entryPredictions.length > 10) {
					APIError.throwJsonError({msg: "Limit exceeded: Cannot add more than 10 predictions per day"})
				} else {

					return Promise.map(entryPredictions, function(prediction) {
						var ticker = prediction.position.security.ticker;
						var existingPredictionsInTicker = predictionsToday.filter(item => {return prediction.position.security.ticker == ticker;});
						var newPredictioninTicker = entryPredictions.filter(item => {return item.position.security.ticker == ticker;});

						if (existingPredictionsInTicker.length + newPredictioninTicker.length > 3) {
							APIError.throwJsonError({msg: `Limit exceeded: Can't add more than 3 prediction for one stock (${ticker})`});
						} else {
							return contestEntry;		
						}
					})
					
				}
			})
		} else {
			return contestEntry;
		}
	})
	.then(contestEntry => {

		//Change this to use PROMISE 
		//And check redundancy of predictions
		var adjustedPredictions = entryPredictions.map(item => {
			
			if (DateHelper.compareDates(item.endDate, item.startDate) == 1 && 
					DateHelper.compareDates(item.startDate, DateHelper.getCurrentDate()) == 0) {
				
				item.startDate = moment().startOf('minute');
				item.endDate = DateHelper.getMarketCloseDateTime(item.endDate);
				item.active = true;
				item.modified = 1;

				return item;

			} else {
				console.log("Invalid prediction");
				return null;
			}
		}).filter(item => item);

		if (contestEntry) {

			if (action == "update") {
				var uniquePredictionDates = _.uniq(adjustedPredictions.map(item => item.startDate.format('YYYY-MM-DD HH:mm:ss')));
				if (uniquePredictionDates.length > 1) {
					APIError.throwJsonError({msg: "Only predictions for single date can be updated"});
				}

				//How to compare the prediction supplied to existing predictions? 
				//No need to compare..Just remove the old ones and add the new ones
				
				return;

				return DailyContestEntryModel.updateEntryPredictions({_id: contestEntry._id}, adjustedPredictions, uniquePredictionDates[0], {new:true, fields:'_id'});
			} else {

				return DailyContestEntryHelper.addPredictions(contestEntry._id, adjustedPredictions); 
				
			}
			
		} else {
			return DailyContestEntryModel.createEntry({
				advisor: advisorId, 
				createdDate: new Date(),
				updatedDate: new Date(),
				predictions: adjustedPredictions
			});
		}
	})
	.then(final => {
		return res.status(200).send("Predictions updated successfully");
	})
	.catch(err => {
		//console.log(err);
		return res.status(400).send(err.message);		
	});
};
 
/*
* Get daily contest winners
*/
module.exports.getDailyContestWinners = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	
	const date = DateHelper.getMarketCloseDateTime(_dd);

	return DailyContestStatsModel.fetchContestStats(date, {fields:'winners'})
	.then(statsForDate => {
		return res.status(200).send(statsForDate);
	})
	.catch(err => {
		return res.status(400).send({msg: err.msg});	
	})
};

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
		var topStocksByInvestment = _.get(statsForDate, 'topStocks.byInvestment', []);

		return Promise.all([
			Promise.map(topStocksByInvestment, function(topStock) {
				return SecurityHelper.getStockLatestDetailByType({ticker: topStock.ticker})
				.then(securityDetail => {
					delete topStock.ticker;
					return {...topStock, security: securityDetail};
				})	
			}),
			Promise.map(topStocksByUsers, function(topStock) {
				return SecurityHelper.getStockLatestDetailByType(ticker: topStock.security)
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
		return res.status(400).send({msg: err.msg});	
	})
};
