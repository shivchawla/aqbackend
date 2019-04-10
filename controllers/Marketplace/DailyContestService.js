/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-10 08:49:41
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
var redis = require('redis');
var path = require('path');
var fs = require('fs');
var csv = require('fast-csv');

const config = require('config');
const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');
const InteractiveBroker = require('../Realtime/interactiveBroker');
const ibTickers = require('../../documents/ibTickers.json');

const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');
const DailyContestStatsModel = require('../../models/Marketplace/DailyContestStats');
const DailyContestEntryPerformanceModel = require('../../models/Marketplace/DailyContestEntryPerformance');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const DailyContestEntryHelper = require('../helpers/DailyContestEntry');
const DailyContestStatsHelper = require('../helpers/DailyContestStats');
const SecurityHelper = require('../helpers/Security');
const AdvisorHelper = require('../helpers/Advisor');
const PredictionRealtimeController = require('../Realtime/predictionControl');
const BrokerRedisController = require('../Realtime/brokerRedisControl');
const funnyNames = require('../../constants/funnyNames');


function _populateWinners(winners, user) {
	const userId = _.get(user, '_id', null);
	const userEmail = _.get(user, 'email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) > -1;

	return Promise.map(winners, function(winner, index) {
		return AdvisorModel.fetchAdvisor({_id: winner.advisor}, {fields: 'user'})
		.then(populatedAdvisor => {
			let requiredUser = populatedAdvisor.user.toObject();
			const advisorUserId = _.get(requiredUser, '_id', null);

			const funnyName = funnyNames[index].split(' ');
			const funnyFirstName = funnyName[0] || 'Funny';
			const funnyLastName = funnyName[1] || 'Yo';
			const shouldNotShowFunnyName = true; //userId === advisorUserId || isAdmin;

			const requiredFirstName = shouldNotShowFunnyName ? _.get(requiredUser, 'firstName', '') : funnyFirstName
			const requiredLastName = shouldNotShowFunnyName ? _.get(requiredUser, 'lastName', '') : funnyLastName;
			const requiredUserEmail = _.get(requiredUser, 'email', null);

			requiredUser = {
				...requiredUser,
				firstName: requiredFirstName,
				lastName: requiredLastName,
				email: requiredUserEmail
			};

			if (!isAdmin) {
				delete requiredUser.email
			}

			return {...winner.toObject(), user: requiredUser};
		})
	})
}

/* 
* Get contest entry for a date
*/
module.exports.getDailyContestPredictions = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	const date = DateHelper.getMarketCloseDateTime(_dd);
	const category = _.get(args, 'category.value', 'all');
	const userId = _.get(args, 'user._id', null);
	let advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	const real = _.get(args, 'real.value', false);

	let advisorSelection = {user: userId, isMasterAdvisor: true};

	if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
		advisorSelection = {_id: advisorId};
	}

	return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id allocation'})
	.then(masterAdvisor => {
		if (masterAdvisor) {
			advisorId = masterAdvisor._id.toString();
			
			if (real) {
				if (_.get(masterAdvisor, 'allocation.status', false)) {
					advisorId = masterAdvisor.allocation.advisor;
				} else {
					APIError.throwJsonError({message: "No real predictions found/possible for this advisor"});
				}
			}
			
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category, active: null});
		} else if(!advisor) {
			APIError.throwJsonError({message: "Not a valid user"});
		} else {
			APIError.throwJsonError({message: `No Contest found for ${date}`});
		}
	})
	.then(updatedPredictions => {
		if (updatedPredictions) {
			if (!isAdmin) {
				updatedPredictions = updatedPredictions.map(item => {
					_.unset(item, 'tradeActivity');
					_.unset(item, 'orderActivity');
					_.unset(item, 'adminActivity');
					_.unset(item, 'skippedByAdmin'); 
					_.unset(item, 'readStatus'); 
					_.unset(item, 'adminModifications'); 
					
					return item;

				});

				return updatedPredictions;
			} else {
				return Promise.map(updatedPredictions, function(prediction) {
					return BrokerRedisController.getPredictionStatus(advisorId, prediction._id)
					.then(status => {
						return {...prediction, current: status};
					})
				});
			}
		} else {
			APIError.throwJsonError({message: `No contest entry found for ${date}`});
		}
	})
	.then(predictions => {
		return res.status(200).send(predictions);
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);		
	});
};

/*
* Admin API to get all active tradeable predictions (all or by advisor)
*/
module.exports.getRealTradePredictions = (args, res, next) => {
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;	
	
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	const date = DateHelper.getMarketCloseDateTime(_dd);

	let advisorId = _.get(args, 'advisorId.value', null);
	const active = _.get(args, 'active.value', null);
	const category = _.get(args, 'category.value', 'all');

	return Promise.resolve()
	.then(() => {
		if (isAdmin) {
			return 	DailyContestEntryHelper.getAllRealTradePredictions(advisorId, date, {active, category});
		}
		else {
			APIError.throwJsonError({message: "Not authorized!!"});
		}
			
	})
	.then(realPredictions => {
		return res.status(200).send(realPredictions);
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
	let advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;

	const real = _.get(args, 'real.value', false); 

	let advisorSelection = {user: userId, isMasterAdvisor: true};

	if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
		advisorSelection = {_id: advisorId};
	}

	return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id allocation'})
	.then(masterAdvisor => {
		if (masterAdvisor) {
			advisorId = masterAdvisor._id.toString();
			
			if (real) {
				if (_.get(masterAdvisor, 'allocation.status', false)) {
					advisorId = masterAdvisor.allocation.advisor;
				} else {
					APIError.throwJsonError({message: "No real predictions found/possible for this advisor"});
				}
			}

			return DailyContestEntryHelper.getPnlStatsForDate(advisorId, date, {category});
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
	let advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	const real = _.get(args, 'real.value', false);

	let advisorSelection = {user: userId, isMasterAdvisor: true};
	if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
		advisorSelection = {_id: advisorId};
	}

	return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id allocation'})
	.then(masterAdvisor => {
		if (masterAdvisor) {
			
			advisorId = masterAdvisor._id.toString();
			
			if (real) {
				if (_.get(masterAdvisor, 'allocation.status', false)) {
					advisorId = masterAdvisor.allocation.advisor;
				} else {
					APIError.throwJsonError({message: "No real predictions found/possible for this advisor"});
				}
			}
			
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
* Update predictions for the contest
*/
module.exports.updateDailyContestPredictions = (args, res, next) => {
	const date = DateHelper.getMarketCloseDateTime(DateHelper.getCurrentDate());

	const userId = _.get(args, 'user._id', null);
	let advisorId = _.get(args, 'advisorId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	var prediction = _.get(args, 'body.value', null);
	let investment, quantity, latestPrice, avgPrice;

	let validStartDate = DailyContestEntryHelper.getValidStartDate();
	
	const conditionalType = _.get(prediction, 'conditionalType', 'NOW');
	const isConditional = conditionalType.toUpperCase() !== 'NOW';
	
	// Investment obtained from the frontend
	let investmentInput = 0;

	const isRealPrediction = _.get(prediction, 'real', false);
	let masterAdvisorId; 

	var security = _.get(prediction, 'position.security', {});

	return Promise.resolve(SecurityHelper.isTradeable(security))
	.then(allowed => {
		if(isRealPrediction && !allowed) {
			APIError.throwJsonError({message: `Real prediction in ${security.ticker} is not allowed`});
		}

		// Conditional items are only allowed during market open hours
		if (!isConditional && !DateHelper.isMarketTrading()) {
			APIError.throwJsonError({message: 'Market is closed! Only conditional predictions allowed'});
		}
		
		if (process.env.NODE_ENV == 'production' && !DateHelper.isMarketTrading(15, 15)) {
		 	APIError.throwJsonError({message: "Market is closed!! Real trades are allowed only between 9:30 AM to 3:15 PM!!"})
		}
	})
	.then(() => {		

		if (!isRealPrediction) {
			investment = _.get(prediction, 'position.investment', 0);
			//Check if investment amount is either 10, 25, 50, 75 or 100K for unreal predictions
			//
			var valid = [10, 25, 50, 75, 100].indexOf(Math.abs(investment)) !=- 1;

			if(!valid) {
				APIError.throwJsonError({message: "Invalid investment value - Virtual Prediction"});
			} else{
				return true;
			}
		}

	})
	.then(() => {
		
		return Promise.all([
			SecurityHelper.getStockLatestDetail(prediction.position.security),
			SecurityHelper.getRealtimeQuote(`${prediction.position.security.ticker}`),
			SecurityHelper.getStockAtr(prediction.position.security)
		])
		.then(([securityDetail, realTimeQuote, atrDetail]) => {
			latestPrice = _.get(realTimeQuote, 'close', 0) || _.get(securityDetail, 'latestDetailRT.current', 0) || _.get(securityDetail, 'latestDetail.Close', 0);
			if (latestPrice != 0) {

				//Investment is modified downstream so can't be const
				investment = _.get(prediction, 'position.investment', 0);
				quantity = _.get(prediction, 'position.quantity', 0);

				if (isRealPrediction && (investment != 0 || quantity <= 0)) {
					APIError.throwJsonError({message: "Must provide zero investment and positive quantity (LONG) for real trades!!"})
				}

				const isConditional = _.get(prediction, "conditionalType", "NOW") != "NOW"
				avgPrice = _.get(prediction, 'position.avgPrice', 0);

				//Computed investment must be divided by 1000 to match internal units
				investment = investment || parseFloat(((isConditional ? quantity*avgPrice : quantity*latestPrice)/1000).toFixed(2));
				investmentInput = investment;
				//Mark the real investment at the latest price as well (execution price may be different)
				//(now this could be not true but let's keep things for simple for now)
				prediction.position.investment = investment

				if (isRealPrediction && investment < 0) {
					APIError.throwJsonError({message: "Only LONG prediction are allowed for real trades!!"})	
				}
				
				const target = prediction.target;
				const stopLoss = _.get(prediction, 'stopLoss', 0);

				if (stopLoss == 0) {
					APIError.throwJsonError({message: "Stoploss must be non-zero"});
				} else if (investment > 0 &&  (stopLoss > latestPrice || stopLoss > target)) {
					APIError.throwJsonError({message: "Inaccurate Stoploss!! Must be lower than the call price"});
				} else if (investment < 0 &&  (stopLoss < latestPrice || stopLoss < target)) {
					APIError.throwJsonError({message: "Inaccurate Stoploss!! Must be higher than the call price"});
				} 

				if (investment > 0 && target < 1.015*latestPrice) {
					APIError.throwJsonError({message:`Long Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 1.0% higher than call price`});
				} else if (investment < 0 && target > 1.015*latestPrice) {
					APIError.throwJsonError({message:`Short Prediction (${prediction.position.security.ticker}): Target price of ${target} must be at-least 1.0% lower than call price`});
				}

				//Add ATR info to prediction
				var atrLatest = _.get(atrDetail, 'atr.latest', 0.0);
				var atrAverage = _.get(atrDetail, 'atr.average', 0.0);
				
				var atr = Math.min(atrAverage, atrLatest);
				
				prediction.atr = {average: atrAverage, latest: atrLatest};

				//In case of real prediction, add the modified stoploss/profit-target
				//Target = 2*ATR 
				//Stoploss = Min(6%, 2*ATR)
				if (isRealPrediction) {
					//Use latestprice for NOW based predictions for computing modified SL/PT
					var tempAvgPrice = isConditional ? avgPrice : latestPrice;
					var mStopLoss = investment > 0 ? 
						Math.max(tempAvgPrice - 2*atr, 0.94*tempAvgPrice) : 
						Math.min(tempAvgPrice + 2*atr, 1.06*tempAvgPrice);

					var mTarget = investment > 0 ? tempAvgPrice + 2*atr : tempAvgPrice - 2*atr;

					prediction.adminModifications = [{stopLoss: mStopLoss, target: mTarget}];
				}

				return;
			} else {
				console.log("Create Prediction: Price not found");
				return; 
			}
		})
	})
	.then(() => {
		let masterAdvisorSelection = {user: userId, isMasterAdvisor: true};
		if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
			masterAdvisorSelection = {_id: advisorId};
		}

		return AdvisorModel.fetchAdvisor(masterAdvisorSelection, {fields: '_id account allocation'})
		.then(masterAdvisor => {

			//Get master advisor id (used later when sending updates)
			masterAdvisorId = masterAdvisor._id.toString();

			if (isRealPrediction) {
				// Checking if investment is not greater than the maxInvestment
				const maxInvestment = _.get(masterAdvisor, 'allocation.maxInvestment', 50) * 1000;

				if (isConditional && avgPrice > 0 && quantity * avgPrice > maxInvestment) {
					APIError.throwJsonError({message: `Effective investment in real trade must be less than ${maxInvestment}!!`})
				}

				if (!isConditional && latestPrice > 0 && quantity * latestPrice > maxInvestment) {
					APIError.throwJsonError({message: `Effective investment in real trade must be less than ${maxInvestment}!!`})
				}

				if (_.get(masterAdvisor, 'allocation.status', false) && _.get(masterAdvisor, 'allocation.advisor', null)) {
					return AdvisorModel.fetchAdvisor({_id: masterAdvisor.allocation.advisor}, {fields: '_id account'}) 
				}
			} else {
				return masterAdvisor;
			}
		})
	})
	.then(effectiveAdvisor => {
		if (effectiveAdvisor) {

			//Choose advisor based on prediction type (Assing advisorId)
			advisorId = effectiveAdvisor._id;

			var liquidCash = _.get(effectiveAdvisor, 'account.liquidCash', 0);

			var investmentRequired = Math.abs(_.get(prediction, 'position.investment', 0));

			if (liquidCash < investmentRequired) {
				if (isRealPrediction) {
					APIError.throwJsonError({message: `Insufficient funds to create real trades!!`});
				} else {
					APIError.throwJsonError({message: `Insufficient funds to create predictions!!`});	
				}
				
			}

			return Promise.all([
				DailyContestEntryHelper.getPredictionsForDate(advisorId, validStartDate, {category: "all", priceUpdate: false, active: null}),
				DailyContestEntryHelper.getPortfolioStatsForDate(advisorId, date),
				AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: 'account'})
			]);
			
		} else {
			if(isRealPrediction) {
				APIError.throwJsonError({message: "Not authorized to make real predictions"});
			} else {
				APIError.throwJsonError({message: "Not a valid user"});
			}
		}
	})
	.then(([activePredictions, portfolioStats, advisor]) => {
		const portfolioValue = _.get(portfolioStats, 'netTotal', 0) || 
				(_.get(advisor, 'account.liquidCash', 0) + _.get(advisor, 'account.investment', 0));

		const tenPercentagePortfolioValue = 0.1005 * portfolioValue;

		activePredictions = activePredictions.filter(item => {
			var completeStatus = _.get(item, 'status.profitTarget', false) ||  
				_.get(item, 'status.stopLoss', false) ||  
				_.get(item, 'status.manualExit', false) ||  
				_.get(item, 'status.expired', false);

				return !completeStatus; 
		});

		var ticker = _.get(prediction, 'position.security.ticker', "");
		var existingPredictionsInTicker = activePredictions.filter(item => {return item.position.security.ticker == ticker;});
		var newPredictionsInTicker = prediction.position.security.ticker == ticker ? [prediction] : [];

		let netInvestmentForTicker = _.sum(existingPredictionsInTicker.map(activePrediction => {
			const predictionInvestment = _.get(activePrediction, 'position.investment', 0);
			return predictionInvestment;		
		}));

		netInvestmentForTicker = netInvestmentForTicker + investmentInput;
		
		if (tenPercentagePortfolioValue !== 0 &&  netInvestmentForTicker > tenPercentagePortfolioValue) {
			APIError.throwJsonError({message: `Limit exceeded: Can't invest more than 10% of your portfolio in a single stock. Stock (${ticker})`});
		}

		if (existingPredictionsInTicker.length + newPredictionsInTicker > 3 && !isRealPrediction) {
			APIError.throwJsonError({message: `Limit exceeded: Can't add more than 3 prediction for one stock (${ticker})`});
		}

		if (existingPredictionsInTicker.length + newPredictionsInTicker.length > 1 && isRealPrediction) {
			APIError.throwJsonError({message: `Limit exceeded: Can't add more than 1 real trade for one stock (${ticker})`});
		}

		return; 
	})
	.then(() => {
		
		if (DateHelper.compareDates(prediction.endDate, prediction.startDate) == 1) {
			
			prediction.startDate = validStartDate;
			prediction.endDate = DateHelper.getMarketCloseDateTime(DateHelper.getNextNonHolidayWeekday(prediction.endDate, 0));
			prediction.modified = 1;
			prediction.nonMarketHoursFlag = DateHelper.isHoliday() || !DateHelper.isMarketTrading();
			prediction.createdDate = new Date();
			
			//Stop-loss type for old predictions was empty;
			prediction.stopLossType = "NOTIONAL";

			var isConditional = prediction.conditionalType != "NOW" && prediction.position.avgPrice != 0; 

			//Set trigger
			prediction = {...prediction, conditional:isConditional, triggered: {status: !isConditional}, conditionalPrice: isConditional ? prediction.position.avgPrice : 0, conditionalType: isConditional ? prediction.conditionalType : ""};

			return prediction;

		} else {
			console.log("Invalid prediction");
			return null;
		}
	})
	.then(adjustedPrediction => {
		if (adjustedPrediction) {
			return DailyContestEntryHelper.addPrediction(advisorId, adjustedPrediction, DateHelper.getMarketCloseDateTime(validStartDate), masterAdvisorId, userId)
		} else {
			APIError.throwJsonError({message: "Adjusted prediciton is NULL/invalid"});
		}
	})
	.then(() => {
		return res.status(200).send("Predictions updated successfully");
	})
	.catch(err => {
		return res.status(400).send(err.message);		
	});
};

/*
* Exit prediction for the contest (based on predictionId) - Can exit both real/simulated predictions
*/
module.exports.exitDailyContestPrediction = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const predictionId = _.get(args, 'predictionId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	let advisorId = _.get(args, 'advisorId.value', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	
	let masterAdvisorId;

	Promise.resolve()
	.then(() => {
		let advisorSelection = {user: userId, isMasterAdvisor: true};
		if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
			advisorSelection = {_id: advisorId};
		}

		return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id allocation'})	
	})
	.then(masterAdvisor => {
		if (masterAdvisor) {
			masterAdvisorId = masterAdvisor._id.toString();

			var date = DateHelper.getMarketCloseDateTime();

			var allocationAdvisorId = _.get(masterAdvisor, 'allocation.advisor', null);

			return Promise.all([
				DailyContestEntryHelper.getPredictionsForDate(masterAdvisorId, date, {category: "all", priceUpdate: false, active: null}),
				allocationAdvisorId ? DailyContestEntryHelper.getPredictionsForDate(allocationAdvisorId, date, {category: "all", priceUpdate: false, active: null}) : []
			])
			.then(([simulatedPredictions, realPredictions]) => {

				//Populate advisorId (necessary to distinguish between real and simulated advisor)
				simulatedPredictions = simulatedPredictions.map(item => {return {...item, advisorId: masterAdvisorId};});
				realPredictions = realPredictions.map(item => {return {...item, advisorId: allocationAdvisorId};})

				return simulatedPredictions.concat(realPredictions);
			})

		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(allPredictions => {
		var idx = allPredictions.findIndex(item => {return item._id.toString() == predictionId;});
		if (idx != -1) {

			var prediction = allPredictions[idx];
			var unfulfilledConditional = _.get(prediction, 'conditional', false) && !_.get(prediction, 'triggered.status', true);

			if (!unfulfilledConditional && !DateHelper.isMarketTrading()) {
				APIError.throwJsonError({message: "Can't exit active prediction - Market is closed"});	
			} 

			prediction.status.manualExit = true;
			prediction.status.trueDate = new Date();
			prediction.status.date = DateHelper.getMarketCloseDateTime(new Date());

			//Set the prediction status to unread 
			var isRealPrediction = _.get(prediction, 'real', false);
			if (isRealPrediction) {
				prediction.readStatus = "UNREAD";
			}

			//What's the effective advisorId
			advisorId = prediction.advisorId;

			return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction)
			.then(() => {

				//Update the Account credit if prediction was never triggered (else handle it in helper)
				var acccountUpdateRequired = !_.get(prediction,'triggered.status', true);

				return Promise.all([
					acccountUpdateRequired ? AdvisorHelper.updateAdvisorAccountCredit(advisorId, prediction) : null,
					isRealPrediction ? PredictionRealtimeController.sendAdminUpdates(masterAdvisorId, prediction._id.toString()) : null
				]);	
			})

		} else {
			APIError.throwJsonError({message: "Exit Prediction: Prediction not found"});
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


/*
* Add trade activity (not trade but information about trade)
 */
module.exports.addPredictionOrderActivity = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const predictionId = _.get(args, 'body.value.predictionId', null);
	const advisorId = _.get(args, 'body.value.advisorId', null);
	const tradeActivity = _.get(args, 'body.value.tradeActivity', null);
	
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;

	let allocationAdvisorId;
	return Promise.resolve()
	.then(() => {
		if (!isAdmin) {
			APIError.throwJsonError({message: "Not authorized to add trade activity"})
		}

		return AdvisorModel.fetchAdvisor({_id: advisorId, isMasterAdvisor: true}, {fields: '_id allocation'})
		.then(masterAdvisor => {
			if (masterAdvisor && _.get(masterAdvisor, 'allocation.status', false) && _.get(masterAdvisor, 'allocation.advisor', null)) {
				allocationAdvisorId = masterAdvisor.allocation.advisor;
				return DailyContestEntryModel.addTradeActivityForPrediction({advisor: allocationAdvisorId}, predictionId, tradeActivity);
			} else {
				APIError.throwJsonError({message: "Advisor doesn't have real prediction status"});
			}
		})
		
	})
	.then(updated => {
		return res.status(200).send("Trade activity added successfully");
	})
	.catch(err => {
		return res.status(400).send(err.message);		
	})
};


/*
* Update read status of prediction
 */
module.exports.updateReadStatusPrediction = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const predictionId = _.get(args, 'body.value.predictionId', null);
	const advisorId = _.get(args, 'body.value.advisorId', null);
	const readStatus = _.get(args, 'body.value.readStatus', null);
	
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;

	let allocationAdvisorId;

	return Promise.resolve()
	.then(() => {
		if (!isAdmin) {
			APIError.throwJsonError({message: "Not authorized to update read status"});
		}

		return AdvisorModel.fetchAdvisor({_id: advisorId, isMasterAdvisor: true}, {fields: '_id allocation'})
		.then(masterAdvisor => {
			if (masterAdvisor && _.get(masterAdvisor, 'allocation.status', false) && _.get(masterAdvisor, 'allocation.advisor', null)) {
				allocationAdvisorId = masterAdvisor.allocation.advisor;
				return DailyContestEntryModel.updateReadStatus({advisor: allocationAdvisorId}, predictionId, readStatus);
			} else {
				APIError.throwJsonError({message: "Advisor doesn't have real prediction status"});
			}
		})
		
	})
	.then(updated => {
		return res.status(200).send("Read status updated successfully");
	})
	.catch(err => {
		return res.status(400).send(err.message);		
	})
};

module.exports.updateSkipStatusPrediction = (args, res, next) => {
	const predictionId = _.get(args, 'body.value.predictionId', null);
	const advisorId = _.get(args, 'body.value.advisorId', null);
	const skippedMessage =_.get(args, 'body.value.message', 'Order skipped by admin');

	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;

	let allocationAdvisorId;
	let requiredMasterAdvisor = null;

	return Promise.resolve()
	.then(() => {
		if (!isAdmin) {
			APIError.throwJsonError({message: 'Not authorized to skip prediction'});
		}

		return AdvisorModel.fetchAdvisor({_id: advisorId, isMasterAdvisor: true}, {fields: '_id allocation'})
	})
	.then(masterAdvisor => {
		requiredMasterAdvisor = masterAdvisor;
		if (masterAdvisor && _.get(masterAdvisor, 'allocation.status', false) && _.get(masterAdvisor, 'allocation.advisor', null)) {
			allocationAdvisorId = masterAdvisor.allocation.advisor;

			return DailyContestEntryModel.updateSkipStatus({advisor: allocationAdvisorId}, predictionId, true);
		} else {
			APIError.throwJsonError({message: "Advisor doesn't have real prediction status"});
		}
	})
	.then(() => {
		const adminActivity = {
			message: skippedMessage,
			activityType: 'SKIP',
			obj: {}
		};

		return Promise.all([
			DailyContestEntryModel.addAdminActivityForPrediction({advisor: allocationAdvisorId}, predictionId, adminActivity),
			DailyContestEntryModel.updateReadStatus({advisor: allocationAdvisorId}, predictionId, true)
		]);
	})
	.then(() => {
		const masterAdvisorId = _.get(requiredMasterAdvisor, '_id', null);

		return PredictionRealtimeController.sendAdminUpdates(masterAdvisorId, predictionId);
	})
	.then(() => {
		return res.status(200).send('Success');
	})
	.catch(err => {
		console.log('Error', err);
	})
}

module.exports.addAdminModificationsToPrediction = (args, res, next) => {
	const userId = _.get(args, 'user._id', null);
	const predictionId = _.get(args, 'body.value.predictionId', null);
	const advisorId = _.get(args, 'body.value.advisorId', null);
	const modification = _.get(args, 'body.value.modification', null);
	
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;

	let allocationAdvisorId;

	return Promise.resolve()
	.then(() => {
		if (!isAdmin) {
			APIError.throwJsonError({message: "Not authorized to add modification"});
		}

		if (!modification) {
			APIError.throwJsonError({message: "Invalid modification"});
		}

		return AdvisorModel.fetchAdvisor({_id: advisorId, isMasterAdvisor: true}, {fields: '_id allocation'})
		.then(masterAdvisor => {
			if (masterAdvisor && _.get(masterAdvisor, 'allocation.status', false) && _.get(masterAdvisor, 'allocation.advisor', null)) {
				allocationAdvisorId = masterAdvisor.allocation.advisor;
				return DailyContestEntryModel.fetchPredictionById({advisor: allocationAdvisorId}, predictionId);
			} else {
				APIError.throwJsonError({message: "Advisor doesn't have real prediction status"});
			}
		})
		
	})
	.then(prediction => {
		if (prediction) {
			
			//Add modication to the arry with date 
			if (prediction.adminModifications && prediction.adminModifications.length > 0) {
				prediction.adminModifications.push({...modification, date: new Date()});
			} else {
				prediction.adminModifications = [{...modification, date: new Date()}];
			}

			return DailyContestEntryModel.updatePrediction({advisor: allocationAdvisorId}, prediction);	
		} else {
			APIError.throwJsonError({message: "Prediction not found"});
		}
	})
	.then(updated => {
		return res.status(200).send("Admin modification added successfully");
	})
	.catch(err => {
		return res.status(400).send(err.message);		
	})
};



/*
* Get daily contest winners
*/
module.exports.getDailyContestWinners = (args, res, next) => {
	const _d = _.get(args, 'date.value', '');
	const _dd = _d == "" || !_d ? DateHelper.getCurrentDate() : DateHelper.getDate(_d);
	const date = DateHelper.getMarketCloseDateTime(_dd);
	const user = _.get(args, 'user', null);
	return DailyContestStatsModel.fetchContestStats(date, {fields:'dailyWinners weeklyWinners'})
	.then(statsForDate => {
		return Promise.all([
			_populateWinners(statsForDate.dailyWinners || [], user),
			_populateWinners(statsForDate.weeklyWinners || [], user)
		]);
	})
	.then(([populatedDailyWinners, populatedWeeklyWinners]) => {
		return res.status(200).send({dailyWinners: populatedDailyWinners, weeklyWinners: populatedWeeklyWinners});
	})
	.catch(err => {
		console.log('Error ', err.message);
		return res.status(400).send({message: err.message});	
	})
};


module.exports.getDailyContestOverallWinnersByEarnings = (args, res, next) => {
	const skip = _.get(args, 'skip.value', 0);
	const limit = _.get(args, 'limit.value', 10); 

	return DailyContestEntryPerformanceModel.fetchDistinctPerformances({}, skip, limit)
	.then(performances => {
		return Promise.map(performances, async performance => {
			let firstName = _.get(performance, 'advisor.user.firstName', '');
			let lastName = _.get(performance, 'advisor.user.lastName', '');
			firstName = firstName[0].toUpperCase() + firstName.slice(1).toLowerCase();
			lastName = lastName[0].toUpperCase() + lastName.slice(1).toLowerCase();
			const userName = `${firstName} ${lastName}`;
			const totalEarnings = _.get(performance, 'totalEarnings', 0);
			const date = _.get(performance, 'date', null)

			return {
				advisorId: _.get(performance, 'advisor._id', null),
				name: userName, 
				totalEarnings,
				pnlStats: performance.pnlStats,
				portfolioStats: performance.portfolioStats,
				date
			};
		})
	})
	.then(winners => {
		/**
		 * 1. We run a map on all the winners object obtained from the previous Promise, get the portfolioStats
		 *    from the db, if it is null
		 * 2. We run a map on all the winners object obtained from the previous Promise, get the pnlStats from
		 *    the db, if it is null
		 * 3. We wrap both the above step in Promise.all, such that both the 2 steps runs aysnchronously
		 */
		return Promise.all([
			Promise.map(winners, winner => {
				const advisorId = _.get(winner, 'advisorId', null);
				if (winner.portfolioStats === null) {
					return DailyContestEntryPerformanceModel.fetchLatestPortfolioStats({advisor: advisorId})
					.then(latestPortfolioStats => {
						return {
							...winner,
							portfolioStats: latestPortfolioStats
						}
					});
				} else {
					return winner;
				}
			}),
			Promise.map(winners, winner => {
				const advisorId = _.get(winner, 'advisorId', null);
				if (winner.pnlStats === null) {
					return DailyContestEntryPerformanceModel.fetchLatestPnlStats({advisor: advisorId})
					.then(latestPnlStats => {
						return {
							...winner,
							pnlStats: _.pick(latestPnlStats, 'latesPnlStats.net.total.portfolio.net')
						}
					});
				} else {
					return winner;
				}
			})
		])
	})
	.then(([allWinnersPortfolioStats, allWinnersPerformanceStats]) => {
		
		/**
		 * Explanation of the following steps
		 * 1. Keys both the portfolio and pnl collections by advisorId, which converts it to object
		 * 2. We merge both the objects obtained from the previous step
		 * 3. We convert the objects into an array of values.
		 * See docs for better explanation
		 */
		const mergedData = _.values(_.merge(
			_.keyBy(allWinnersPortfolioStats, 'advisorId'),
			_.keyBy(allWinnersPerformanceStats, 'advisorId'),
		))
		return res.status(200).send(mergedData);
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

	const real = _.get(args, 'real.value', false);

	return Promise.resolve()
	.then(() => {
		if (symbol && horizon) {

			APIError.throwJsonError({message: "Only one of symbol/horizon parameter is allowed"})
		} else {
			let advisorSelection = {user: userId, isMasterAdvisor: true};
			
			if (advisor !== null && (advisor || '').trim().length > 0) {
				advisorSelection = {_id: advisor.trim()};
			}

			return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id allocation'});		
		}
	})
	.then(masterAdvisor => {
		if (masterAdvisor) {
			let advisorId = masterAdvisor._id.toString();
			
			if (real) {
				if (_.get(masterAdvisor, 'allocation.status', false)) {
					advisorId = masterAdvisor.allocation.advisor;
				} else {
					APIError.throwJsonError({message: "No real predictions found/possible for this advisor"});
				}
			}

			switch(category) {
				case "general" : return DailyContestEntryHelper.getDailyContestEntryPnlStats(advisorId, symbol, horizon); 
				case "prediction" : return DailyContestEntryHelper.getDailyContestEntryPnlStats(advisorId, symbol, horizon); break;
				case "pnl" : return DailyContestEntryHelper.getDailyContestEntryPnlStats(advisorId, horizon); break;
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

/*
* Get contest (dashboard stats) for user
*/
module.exports.getDailyContestPerformanceStats = (args, res, next) => {
	
	const advisor = _.get(args, 'advisor.value', null);
	const userId = _.get(args, 'user._id', null);
	const real = _.get(args, 'real.value', false);

	let selection = {user: userId, isMasterAdvisor: true};

	if (advisor !== null && (advisor || '').trim().length > 0) {
		selection = {_id: advisor.trim()};
	}

	return AdvisorModel.fetchAdvisor({...selection}, {fields: '_id allocation'})		
	.then(masterAdvisor => {
		if (masterAdvisor) {
			let advisorId = masterAdvisor._id.toString();
			
			if (real) {
				if (_.get(masterAdvisor, 'allocation.status', false)) {
					advisorId = masterAdvisor.allocation.advisor;
				} else {
					APIError.throwJsonError({message: "No real predictions found/possible for this advisor"});
				}
			}

			return DailyContestEntryHelper.getLatestPerformanceStats(advisorId);
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
    const weekly = _.get(args, 'weekly.value', false);

    Promise.resolve(true)
    .then(() => {
        if (admins.indexOf(userEmail) !== -1){ // user is admin and can send email
            return DailyContestStatsHelper.sendDailyWinnerDigest(date, weekly);
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

module.exports.placeOrderForPrediction = function(args, res, next ) {
	
	const userEmail = _.get(args, 'user.email', null);
	const admins = config.get('admin_user');
	const isAdmin = admins.indexOf(userEmail) !== -1;
	
	const predictionId = _.get(args, 'body.value.predictionId', null);
	const advisorId = _.get(args, 'body.value.advisorId', null);
	const message = _.get(args, 'body.value.message', '');
	const order = _.get(args, 'body.value.order', {});
	const bracketFirstOrderType = _.get(order, 'bracketFirstOrderType', 'LIMIT');
	let stock = _.get(order, 'symbol', null);
	const orderType = _.get(order, 'orderType', null);
	const quantity = _.get(order, 'quantity', 0);
	const price = _.get(order, 'price', 0);
	const type = _.get(order, 'tradeDirection', 'BUY');
	const stopLossPrice = _.get(order, 'stopLossPrice', 0);
	const profitLimitPrice = _.get(order, 'profitLimitPrice', 0);

	let allocationAdvisorId = null;

	const ibSymbol = ibTickers[stock];
	if (ibSymbol !== undefined) {
		stock = ibSymbol;
	}

	const orderParams = {stock, type, quantity, price, orderType, stopLossPrice, profitLimitPrice};

	Promise.resolve()
	.then(() => {
		// Check if user is admin only then all the other operations are permitted
		if (isAdmin) {
			return AdvisorModel.fetchAdvisor({_id: advisorId, isMasterAdvisor: true}, {fields: '_id allocation'})
		} else {
			APIError.throwJsonError({message: "User not authorized to place orders"});
		}
	})
	.then(masterAdvisor => {
		const allocationStatus = _.get(masterAdvisor, 'allocation.status', false);
		allocationAdvisorId = _.get(masterAdvisor, 'allocation.advisor', null);
		
		// We are checking if the user is allocated and is allowed for real predictions
		if (masterAdvisor && allocationStatus && allocationAdvisorId) {
			return DailyContestEntryModel.fetchPredictionById({advisor: allocationAdvisorId}, predictionId);
		} else {
			APIError.throwJsonError({message: "Advisor doesn't have real prediction status"});
		}
	})
	.then(prediction => {
		if (prediction) {
			// Creating the admin activity, admin activity will always be added as soon as the user
			// places an order
			const adminActivity = {
				message,
				activityType: 'ORDER',
				obj: {
					orderType,
					price,
					profitLimitPrice,
					quantity,
					stopLossPrice,
					tradeDirection: type,
				}
			};

			// Placing the order in the market
			// Adding admin activity to the prediction
			return Promise.all([
				InteractiveBroker.placeOrder({...orderParams, predictionId, advisorId, bracketFirstOrderType}),
				DailyContestEntryModel.addAdminActivityForPrediction({advisor: allocationAdvisorId}, predictionId, adminActivity),
				DailyContestEntryModel.updateReadStatus({advisor: allocationAdvisorId}, predictionId, true)
			])
			
		} else {
			APIError.throwJsonError({message: "Prediction not found"});
		}
	})
	.then(([success]) => {
		return res.status(200).send("Order placed successfully");
	})
	.catch(err => {
		console.log('Error ', err);
		return res.status(400).send(err.message);
	})
}

module.exports.modifyOrderForPrediction = function(args, res, next ) {
	const userEmail = _.get(args, 'user.email', null);
	const admins = config.get('admin_user');
	const isAdmin = admins.indexOf(userEmail) !== -1;
	
	const advisorId = _.get(args, 'body.value.advisorId', null);
	const predictionId = _.get(args, 'body.value.predictionId', null);
	const message = _.get(args, 'body.value.message', '');
	const order = _.get(args, 'body.value', {});
	let stock = _.get(order, 'stock', null);
	const orderType = _.get(order, 'orderType', null);
	const quantity = _.get(order, 'quantity', 0);
	const price = _.get(order, 'price', 0);
	const type = _.get(order, 'tradeDirection', 'BUY');
	const orderId = _.get(order, 'orderId', null);
	const tif = _.get(order, 'tif', 'GTC');

	let allocationAdvisorId = null;

	const ibSymbol = ibTickers[stock];
	if (ibSymbol !== undefined) {
		stock = ibSymbol;
	}

	const orderParams = {orderId, tif, stock, type, quantity, price, orderType};

	Promise.resolve()
	.then(() => {
		// Check if user is admin only then all the other operations are permitted
		if (isAdmin) {
			return AdvisorModel.fetchAdvisor({_id: advisorId, isMasterAdvisor: true}, {fields: '_id allocation'})
		} else {
			APIError.throwJsonError({message: "User not authorized to place orders"});
		}
	})
	.then(masterAdvisor => {
		const allocationStatus = _.get(masterAdvisor, 'allocation.status', false);
		allocationAdvisorId = _.get(masterAdvisor, 'allocation.advisor', null);
		
		// We are checking if the user is allocated and is allowed for real predictions
		if (masterAdvisor && allocationStatus && allocationAdvisorId) {
			return DailyContestEntryModel.fetchPredictionById({advisor: allocationAdvisorId}, predictionId);
		} else {
			APIError.throwJsonError({message: "Advisor doesn't have real prediction status"});
		}
	})
	.then(prediction => {
		if (prediction) {
			// Creating the admin activity, admin activity will always be added as soon as the user
			// places an order
			const adminActivity = {
				message,
				activityType: 'MODIFY ORDER',
				obj: orderParams
			};

			// Placing the order in the market
			// Adding admin activity to the prediction
			return Promise.all([
				InteractiveBroker.modifyOrder(orderParams),
				DailyContestEntryModel.addAdminActivityForPrediction({advisor: allocationAdvisorId}, predictionId, adminActivity),
			])
			
		} else {
			APIError.throwJsonError({message: "Prediction not found"});
		}
	})
	.then(([success]) => {
		return res.status(200).send("Order placed successfully");
	})
	.catch(err => {
		console.log('Error ', err);
		return res.status(400).send(err.message);
	})
}

module.exports.cancelOrderForPrediction = function(args, res, next ) {
	const userEmail = _.get(args, 'user.email', null);
	const admins = config.get('admin_user');
	const isAdmin = admins.indexOf(userEmail) !== -1;
	const orderId = _.get(args, 'body.value.orderId', null);
	const advisorId = _.get(args, 'body.value.advisorId', null);
	const predictionId = _.get(args, 'body.value.predictionId', null);
	const message = _.get(args, 'body.value.messaage', null);
	let allocationAdvisorId = null;

	Promise.resolve()
	.then(() => {
		// Check if user is admin only then all the other operations are permitted
		if (isAdmin) {
			return AdvisorModel.fetchAdvisor({_id: advisorId, isMasterAdvisor: true}, {fields: '_id allocation'});
		} else {
			APIError.throwJsonError({message: "User not authorized to cancel orders"});
		}
	})
	.then(masterAdvisor => {
		allocationAdvisorId = _.get(masterAdvisor, 'allocation.advisor', null);
		const adminActivity = {
			message,
			activityType: 'CANCEL',
			obj: {
				orderId
			}
		};
		
		return Promise.all([
			InteractiveBroker.cancelOrder(Number(orderId)),
			DailyContestEntryModel.addAdminActivityForPrediction({advisor: allocationAdvisorId}, predictionId, adminActivity)
		]);
	})
	.then(() => {
		return res.status(200).send("Order cancelled successfully"); 
	})
	.catch(err => {
		console.log('Error', err);
		return res.status(400).send(err.message);
	})
}

module.exports.getHistoricalDataForStock = function(args, res, next) {
	const symbol = _.get(args, 'symbol.value', '');
	
	Promise.resolve()
	.then(() => {
		return InteractiveBroker.requireHistoricalData(symbol)
	})
	.then(historicalData => {
		return res.status(200).send(historicalData);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
}
