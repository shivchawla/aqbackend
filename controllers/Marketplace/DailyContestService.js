/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:57:48
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-05 17:57:22
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
const AdvisorHelper = require('../helpers/Advisor');

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
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category, active: null});
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
	.then(() => {
		return ;
		// if (!DateHelper.isMarketTrading(15, 15) && entryPredictions.filter(item => item.real).length > 0) {
		//  	APIError.throwJsonError({message: "Market is closed!! Real trades are allowed only between 9:30 AM to 3:15 PM!!"})
		// }
	})
	.then(() => {		
		//Check if investment amount is either 10, 25, 50, 75 or 100K for unreal predictions
		return Promise.map(entryPredictions.filter(item =>  {return !item.real;}).map(item => {return _.get(item, 'position.investment');}), function(investment) {
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

					const investment = _.get(prediction, 'position.investment', 0);
					const quantity = _.get(prediction, 'position.quantity', 0);
					const isRealPrediction = _.get(prediction, 'real', false);

					if (isRealPrediction && (investment != 0 || quantity <= 0)) {
						APIError.throwJsonError({message: "Must provide zero investment and positive quantity (LONG) for real trades!!"})
					}

					const isConditional = _.get(prediction, "conditionalType", "NOW") == "NOW"
					const avgPrice = _.get(prediction, 'position.avgPrice', 0);

					investment = investment || (isConditional ? quantity.avgPrice : quantity*latestPrice);

					//Mark the real investment at the latest price as well (execution price may be different)
					//(now this could be not true but let's keep things for simple for now)
					prediction.investment = investment

					if (isRealPrediction && investment < 0) {
						APIError.throwJsonError({message: "Only LONG prediction are allowed for real trades!!"})	
					}
					
					if (isRealPrediction) {

						if (isConditional && avgPrice > 0 && quantity*avgPrice > 50000) {
							APIError.throwJsonError({message: "Effective investment in real trade must be less than 50K!!"})
						}

						if (!isConditional && latestPrice > 0 && quantity*latestPrice > 50000) {
							APIError.throwJsonError({message: "Effective investment in real trade must be less than 50K!!"})
						}
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
		return AdvisorModel.fetchAdvisor(advisorSelection, {fields: '_id account allocation'})
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
				APIError.throwJsonError({message: `Insufficient funds to create predictions!!`});
			}

			var realPredictions = entryPredictions.filter(item => item.real);

			if (realPredictions.length > 0) {
				var allocationStatus = _.get(advisor, 'allocation.status', false);
				if (!allocationStatus) {
					APIError.throwJsonError({message: `User not authorized to place real trades`});
				}

				var realLiquidCash = _.get(advisor, 'allocation.account.liquidCash', 0);
				var realInvestmentRequired = 0;

				//Real investment is an approximation (actual investment will be different based on markt entry price)
				//The risk is currently borne by the company
				realPredictions.forEach(item => {
					realInvestmentRequired += Math.abs(_.get(item, 'position.investment', 0));
				});

				if (realLiquidCash < realInvestmentRequired) {
					APIError.throwJsonError({message: `Insufficient funds to create real trades!!`});
				}

			}
			
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, validStartDate, {category: "all", priceUpdate: false, active: null});
		} else {
			APIError.throwJsonError({message: "Not a valid user"});
		}
	})
	.then(activePredictions => {

		activePredictions = activePredictions.filter(item => {
			var completeStatus = _.get(item, 'status.profitTarget', false) ||  
				_.get(item, 'status.stopLoss', false) ||  
				_.get(item, 'status.manualExit', false) ||  
				_.get(item, 'status.expired', false);

				return !completeStatus; 
		});

		return Promise.map(entryPredictions, function(prediction) {
			
			var ticker = _.get(prediction, 'position.security.ticker', "");
			var existingPredictionsInTicker = activePredictions.filter(item => {return item.position.security.ticker == ticker;});
			var newPredictionsInTicker = entryPredictions.filter(item => {return item.position.security.ticker == ticker;});

			if (existingPredictionsInTicker.length + newPredictionsInTicker.length > 3) {
				APIError.throwJsonError({message: `Limit exceeded: Can't add more than 3 prediction for one stock (${ticker})`});
			}

			var existingRealPredictionsInTicker = activePredictions.filter(item => {return item.position.security.ticker == ticker && item.real;});
			var newRealPredictionsInTicker = entryPredictions.filter(item => {return item.position.security.ticker == ticker && item.real;});

			if (existingRealPredictionsInTicker.length + newRealPredictionsInTicker.length > 1) {
				APIError.throwJsonError({message: `Limit exceeded: Can't add more than 1 real trade for one stock (${ticker})`});
			}

			return; 
		})
	})
	.then(() => {
		return Promise.mapSeries(entryPredictions, function(item) {
			if (DateHelper.compareDates(item.endDate, item.startDate) == 1) {
				
				item.startDate = validStartDate;
				item.endDate = DateHelper.getMarketCloseDateTime(DateHelper.getNextNonHolidayWeekday(item.endDate, 0));
				item.modified = 1;
				item.nonMarketHoursFlag = DateHelper.isHoliday() || !DateHelper.isMarketTrading();
				item.createdDate = new Date();
					
				var isConditional = item.conditionalType != "NOW" && item.position.avgPrice != 0; 

				//Set trigger
				item = {...item, conditional:isConditional, triggered: {status: !isConditional}, conditionalPrice: isConditional ? item.position.avgPrice : 0, conditionalType: isConditional ? item.conditionalType : ""};

				return item;

			} else {
				console.log("Invalid prediction");
				return null;
			}
		})
	})
	.then(adjustedPredictions => {
		adjustedPredictions = adjustedPredictions.filter(item => item);
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
			return DailyContestEntryHelper.getPredictionsForDate(advisorId, date, {category: "all", priceUpdate: false, active: null});
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

			return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction)
			.then(() => {
				//Update the Account credit if prediction was never triggered (else handle it in helper)
				if (!_.get(prediction,'triggered.status', true)) {
					return AdvisorHelper.updateAdvisorAccountCredit(advisorId, prediction);
				}
			})

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

	let selection = {user: userId};

	if (advisor !== null && (advisor || '').trim().length > 0) {
		selection = {_id: advisor.trim()};
	}

	return AdvisorModel.fetchAdvisor({...selection}, {fields: '_id'})		
	.then(advisor => {
		if (advisor) {
			const advisorId = advisor._id.toString()
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

