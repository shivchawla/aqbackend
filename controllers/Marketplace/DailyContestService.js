/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-21 11:42:36
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
* Get contest entry for a date
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

			return DailyContestEntryHelper.getPnlForDate(advisorId, date, category);
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

			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "active", priceUpdate:false});
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
		return res.status(400).send({msg: err.msg});	
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
					APIError.throwJsonError({msg:`Long Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 1.5% higher than call price`});
				} else if (investment < 0 && target > 1.015*latestPrice) {
					APIError.throwJsonError({msg:`Short Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 1.5% lower than call price`});
				}
				return;
			} else {
				console.log("Create Prediction: Price not found");
				return; 
			}
		})
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
			
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, validStartDate, {category: "started", priceUpdate: false});
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(predictionsToday => {
		if (predictionsToday.length + entryPredictions.length > 10000000000) {
			APIError.throwJsonError({msg: "Limit exceeded: Cannot add more than 10 predictions per day"})
		} else {

			return Promise.map(entryPredictions, function(prediction) {
				var ticker = prediction.position.security.ticker;
				var existingPredictionsInTicker = predictionsToday.filter(item => {return item.position.security.ticker == ticker;});
				var newPredictioninTicker = entryPredictions.filter(item => {return item.position.security.ticker == ticker;});

				if (existingPredictionsInTicker.length + newPredictioninTicker.length > 3) {
					APIError.throwJsonError({msg: `Limit exceeded: Can't add more than 3 prediction for one stock (${ticker})`});
				}

				return; 
			})
		}
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
	
	let advisorId;

	Promise.resolve()
	.then(() => {
		if(DateHelper.isMarketTrading()) {
			APIError.throwJsonError({message: "Can't exit - Market is closed"});
		} else {
			return;
		}
	})
	.then(() => {
		return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'})	
	})
	.then(advisor => {
		if (advisor) {
			advisorId = advisor._id.toString();
			var date = DateHelper.getMarketCloseDateTime(prediction.startDate);
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "started", priceUpdate: false});
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(allStartedPredictions => {
		var idx = allStartedPredictions.indexOf(item => {return item._id.toString() == predictionId;});
		if (idx != -1) {

			var prediction = allStartedPredictions[idx];
			prediction.status.manualExit = true;
			prediction.status.trueDate = new Date();
			prediction.status.date = DateHelper.getMarketCloseDateTime(new Date());

			return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction);

		} else {
			APIError.throwJsonError({message: "Prediction not found"});
		}
	})
	.then(final => {
		return res.status(200).send("Prediction exited successfully");
	})
	.catch(err => {
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
		return Promise.map(statsForDate.winners, function(winner) {
			return AdvisorModel.fetchAdvisor({_id: winner.advisor}, {fields: 'user'})
			.then(populatedAdvisor => {
				return {...winner.toObject(), user: populatedAdvisor.user.toObject()};
			})
		})
	})
	.then(populatedWinners => {
		return res.status(200).send({winners: populatedWinners});
	})
	.catch(err => {
		return res.status(400).send({msg: err.msg});	
	})
};

/*
* Get daily contest top stocks
*/
module.exports.getDailyContestTopStocks = (args, res, next) => {
	try{
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
		return res.status(400).send({msg: err.msg});	
	})} catch(err){console.log(err);}
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

			APIError.throwJsonError({msg: "Only one of symbol/horizon parameter is allowed"})
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
    	return res.status(200).send({msg: "Top stocks updated"});
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
    	return res.status(200).send({msg: "Pnl Stats Updated"});
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
            return DailyContestStatsHelper.sendWinnerDigest(date);
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


