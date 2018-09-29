/*
* @Author: Shiv Chawla
* @Date:   2018-09-28 12:39:08
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-29 11:33:23
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const ContestEntryModel = require('../../models/Marketplace/ContestEntry');
const Promise = require('bluebird');
const WebSocket = require('ws'); 
const config = require('config');
const PerformanceHelper = require("../helpers/Performance");
const PortfolioHelper = require("../helpers/Portfolio");
const AdvisorHelper = require("../helpers/Advisor");
const DateHelper = require("../../utils/Date");
const APIError = require('../../utils/error');
const WSHelper = require('./WSHelper');
const sendEmail = require('../../email');
const SecurityHelper = require('./Security');
const _ = require('lodash');

const contestEntryRequirements = require('../../constants').benchmarkUniverseRequirements;

function formatMoneyValueMaxTwoDecimals(value) {
	if (value && typeof(value) == "number"){
		var x = (value/100000) > 1.0 ? value.toFixed(0) : value.toFixed(2);
		var afterPoint = '';
		if(x.indexOf('.') > 0)
		   afterPoint = x.substring(x.indexOf('.'),x.length);
		x = Math.floor(x);
		x=x.toString();
		var lastThree = x.substring(x.length-3);
		var otherNumbers = x.substring(0,x.length-3);
		if(otherNumbers !== '' && otherNumbers !== '-')
		    lastThree = ',' + lastThree;
		return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree + afterPoint;
	} else{
		return value;
	}
}

function _getContestEntryOptions(benchmark) {
	return contestEntryRequirements[benchmark];
}

function _filterActive(objs) {
	return objs ? objs.filter(item => {return item.active == true}).length : 0;	
} 

function _getSuggestedContestEntryName(benchmark) {
	return new Promise(resolve => {
		ContestEntryModel.countEntries({})
		.then(count => {
			resolve(`Contest Entry#${count + 1} vs ${benchmark}`);
		})
		.catch(err => {
			console.log("Can't count contest entries!! Generating Random Name");
			resolve(Math.random().toString(36));
		})
	});
}

function _validateContestEntryFull(currentPortfolio, validityRequirements, oldPortfolio) {
	var fields = Object.keys(validityRequirements);
	var currentPositions = _.get(currentPortfolio, 'detail.positions', []);
	var oldPositions = _.get(oldPortfolio, 'detail.positions', []);

	var benchmark = _.get(currentPortfolio, 'benchmark')
	var isCreate = !oldPortfolio;

	return Promise.map(fields, function(field) {

		let validity = {valid: true};
		if(field == 'MAX_NET_VALUE') {
			//Check for NET VALUE limit
			var currentNetValue = _.get(currentPortfolio, 'pnlStats.netValue', 0.0) * 0.99;
			var oldNetValue = _.get(oldPortfolio, 'pnlStats.netValue', 0.0);

			var softMaxNavLimit = _.get(validityRequirements, 'MAX_NET_VALUE.SOFT', 500000);
			var hardMaxNavLimit = _.get(validityRequirements, 'MAX_NET_VALUE.HARD', 550000); 
				
			var softMinNavLimit = _.get(validityRequirements, 'MIN_NET_VALUE.SOFT', 450000); 
			var hardMinNavLimit = _.get(validityRequirements, 'MIN_NET_VALUE.HARD', 400000); 
			
			if (isCreate && currentNetValue > softMaxNavLimit) {
				validity = {valid: false, message:`Portfolio Value of ${formatMoneyValueMaxTwoDecimals(currentNetValue)} is greater than ${formatMoneyValueMaxTwoDecimals(softMaxNavLimit)}`};
			} 
			else if (!isCreate && oldNetValue > hardMaxNavLimit && currentNetValue > softMaxNavLimit) {
				validity = {valid: false, message:`Portfolio Value of ${formatMoneyValueMaxTwoDecimals(currentNetValue)} is greater than ${formatMoneyValueMaxTwoDecimals(softMaxNavLimit)}`};
			} 
			else if (!isCreate && oldNetValue < hardMaxNavLimit && currentNetValue > oldNetValue && currentNetValue > softMaxNavLimit) {
				validity = {valid: false, message:`Portfolio Value of ${formatMoneyValueMaxTwoDecimals(currentNetValue)} is greater than ${formatMoneyValueMaxTwoDecimals(oldNetValue)}`};
			}  
			
		}

		else if(field == 'MIN_NET_VALUE') {
			//Check for NET VALUE limit
			var currentNetValue = _.get(currentPortfolio, 'pnlStats.netValue', 0.0) * 0.99;
			var oldNetValue = _.get(oldPortfolio, 'pnlStats.netValue', 0.0);

			var softMinNavLimit = _.get(validityRequirements, 'MIN_NET_VALUE.SOFT', 450000); 
			var hardMinNavLimit = _.get(validityRequirements, 'MIN_NET_VALUE.HARD', 400000); 
			
			if (isCreate && currentNetValue < softMinNavLimit) {
				validity = {valid: false, message:`Portfolio Value of ${formatMoneyValueMaxTwoDecimals(currentNetValue)} is less than ${formatMoneyValueMaxTwoDecimals(softMinNavLimit)}`};
			}  
			else if (!isCreate && oldNetValue < hardMinNavLimit && currentNetValue < softMinNavLimit) {
				validity = {valid: false, message:`Portfolio Value of ${formatMoneyValueMaxTwoDecimals(currentNetValue)} is less than ${formatMoneyValueMaxTwoDecimals(softMinNavLimit)}`};
			}
			else if (!isCreate && oldNetValue > hardMinNavLimit && currentNetValue < oldNetValue && oldNetValue < softMinNavLimit) {
				validity = {valid: false, message:`Portfolio Value of ${formatMoneyValueMaxTwoDecimals(currentNetValue)} is less than ${formatMoneyValueMaxTwoDecimals(oldNetValue)}`};
			}
			else if (!isCreate && currentNetValue < softMinNavLimit && oldNetValue > softMinNavLimit) {
				validity = {valid: false, message:`Portfolio Value of ${formatMoneyValueMaxTwoDecimals(currentNetValue)} is less than ${formatMoneyValueMaxTwoDecimals(softMinNavLimit)}`};
			} 			 
			
		}
		 
		else if(field == 'MIN_POS_COUNT') {
			//Check for POSITION COUNT and STOCK EXPOSURE limit
			if (currentPositions) {
				var minPosCount = _.get(validityRequirements, 'MIN_POS_COUNT', 5);
				if (currentPositions.length < minPosCount) {
					validity = {valid: false, message:`Position count is less than ${minPosCount}`};
				}
			}
		} 

		else if(field == 'MAX_STOCK_EXPOSURE') {

			try {
				var softMaxPositionExposure = _.get(validityRequirements, 'MAX_STOCK_EXPOSURE.SOFT', 50000);
				var hardMaxPositionExposure = _.get(validityRequirements, 'MAX_STOCK_EXPOSURE.HARD', 60000);
				
				let oldStockExposureObj = {}
				oldPositions.forEach(item => {
					oldStockExposureObj[item.security.ticker] = item.quantity * item.lastPrice;
				});

				currentPositions.forEach(item => {
					var ticker = item.security.ticker;
					var currentStockExposure = item.quantity * item.lastPrice * 0.99;
					var oldStockExposure = _.get(oldStockExposureObj, ticker, 0.0);

					if (isCreate && currentStockExposure > softMaxPositionExposure) {
						validity = {valid: false, message:`Exposure in ${item.security.ticker} is greater than ${formatMoneyValueMaxTwoDecimals(softMaxPositionExposure)}`};
						throw new Error("Invalid");
					}
					else if (!isCreate && oldStockExposure < softMaxPositionExposure && currentStockExposure > softMaxPositionExposure) {
						validity = {valid: false, message:`Exposure in ${item.security.ticker} is greater than ${formatMoneyValueMaxTwoDecimals(softMaxPositionExposure)}`};
						throw new Error("Invalid");
					}
					else if (!isCreate && oldStockExposure > hardMaxPositionExposure && currentStockExposure > softMaxPositionExposure) {
						validity = {valid: false, message:`Exposure in ${item.security.ticker} is greater than ${formatMoneyValueMaxTwoDecimals(softMaxPositionExposure)}`};
						throw new Error("Invalid");
					} 
					else if (!isCreate && oldStockExposure > softMaxPositionExposure && currentStockExposure > softMaxPositionExposure && currentStockExposure > oldStockExposure) {
						validity = {valid: false, message:`Exposure in ${item.security.ticker} is greater than ${formatMoneyValueMaxTwoDecimals(oldStockExposure)}`};
						throw new Error("Invalid");
					}
				});

			} catch(err) {
				
			}				
		} 

		else if (field == 'MIN_SECTOR_COUNT') {
			//Check for SECTOR COUNT limit
			var sectors = _.uniq(currentPositions.map(item => _.get(item, 'security.detail.Sector', "")));
			var minSectorCount = _.get(validityRequirements, 'MIN_SECTOR_COUNT', 0)
			
			if (sectors.length < minSectorCount) {
				validity = {valid: false, message:`Sector count is less than ${minSectorCount}`};
			}
		} 

		else if (field == 'MAX_SECTOR_COUNT') {
			//Check for SECTOR COUNT limit
			var sectors = _.uniq(currentPositions.map(item => _.get(item, 'security.detail.Sector', "")));
			var maxSectorCount = _.get(validityRequirements, 'MAX_SECTOR_COUNT', 100);
			
			if (sectors.length > maxSectorCount) {
				validity = {valid: false, message:`Sector count is greater than ${maxSectorCount}`};
			} 
		} 

		else if (field == 'MAX_SECTOR_EXPOSURE') {
			//Check for SECTOR EXPOSURE limit
			try {

				var currentSectors = _.uniq(currentPositions.map(item => _.get(item, 'security.detail.Sector', "")));
				var hardMaxSectorExposure = _.get(validityRequirements, 'MAX_SECTOR_EXPOSURE.HARD', 180000);
				var softMaxSectorExposure = _.get(validityRequirements, 'MAX_SECTOR_EXPOSURE.SOFT', 210000);
				
				let currentSectorExposureObj = {};
				let oldSectorExposureObj = {};
				
				currentPositions.forEach(item => {
					var sector = _.get(item, 'security.detail.Sector', "");
					if (sector in currentSectorExposureObj) {
						currentSectorExposureObj[sector] += item.quantity * item.lastPrice * 0.99; 
					} else {
						currentSectorExposureObj[sector] = item.quantity * item.lastPrice * 0.99; 
					}
				});

				oldPositions.forEach(item => {
					var sector = _.get(item, 'security.detail.Sector', "");
					if (sector in oldSectorExposureObj) {
						oldSectorExposureObj[sector] += item.quantity * item.lastPrice; 
					} else {
						oldSectorExposureObj[sector] = item.quantity * item.lastPrice; 
					}
				});

				currentSectors.forEach(sector => {
					if (sector in currentSectorExposureObj && sector != "") {
						let currentSectorExposure = currentSectorExposureObj[sector];

						if (isCreate && currentSectorExposure > softMaxSectorExposure) {
							validity = {valid: false, message:`Exposure in ${sector.toUpperCase()} sector is greater than ${formatMoneyValueMaxTwoDecimals(softMaxSectorExposure)}`};
							throw new Error("Invalid");
						}	

						let oldSectorExposure = _.get(oldSectorExposureObj, sector, 0.0);
						if (!isCreate && oldSectorExposure < softMaxSectorExposure && currentSectorExposure > softMaxSectorExposure) {
							validity = {valid: false, message:`Exposure in ${sector.toUpperCase()} sector is greater than ${formatMoneyValueMaxTwoDecimals(softMaxSectorExposure)}`};
							throw new Error("Invalid");
						}
						if (!isCreate && oldSectorExposure > hardMaxPositionExposure && currentSectorExposure > softMaxSectorExposure) {
							validity = {valid: false, message:`Exposure in ${sector.toUpperCase()} sector is greater than ${formatMoneyValueMaxTwoDecimals(softMaxSectorExposure)}`};
							throw new Error("Invalid");
						}
						else if (!isCreate && oldSectorExposure > softMaxSectorExposure && currentSectorExposure > softMaxSectorExposure && currentSectorExposure > oldStockExposure) {
							validity = {valid: false, message:`Exposure in ${sector.toUpperCase()} sector is greater than ${formatMoneyValueMaxTwoDecimals(oldStockExposure)}`};
							throw new Error("Invalid");
						}
					}
				});
			} catch(err) {
			}
			
		}

		else if (field == 'STOCK_LIST') {

			//Check for Security list
			var tickers = _.uniq(positions.map(item => _.get(item, 'security.ticker', '')).filter(item => item!=""))

			const universe = _.get(validityRequirements, 'universe', null);
			const sector = _.get(validityRequirements, 'sector', null);
			const industry = _.get(validityRequirements,' industry', null);
			
			//This call is slow!! Can we cache the output of this call
			return SecurityHelper.getStockList("", {universe, sector, industry})
			.then(universeList => {
				var universeTickers = _.uniq(universeList.map(item => _.get(item, 'ticker', '')).filter(item => item!=""))
				if (_.intersection(tickers, universeTickers).length < tickers.length) {
					
					try {
						tickers.forEach(item => {
							if (universeTickers.indexOf(item) == -1) {
								validity = {valid: false, message:`${item} is not a part of allowed stock list`};
								throw new Error("Invalid");
							}
						})
					} catch (err){

					}
				}

			});
		}

		return {[field]: validity};	
	});
}

//HELPER FUNCTION -- looks weird
module.exports.saveContestEntry = function(contestEntry, advisorId, effectiveStartDate, userDetails) {
	return Promise.all([
		PortfolioHelper.savePortfolio(contestEntry.portfolio, true),
		_getSuggestedContestEntryName(_.get(contestEntry, 'portfolio.benchmark.ticker', 'NIFTY_50'))
	])
	.then(([port, contestEntryName]) => {
		if(port) {
			const entry = {
				name: contestEntryName, //This is suggested in case of contest entry
				advisor: advisorId,
		       	portfolio: port._id,
		       	createdDate: new Date(),
		       	startDate: effectiveStartDate, 
		       	updatedDate: new Date(),
			};

		    return ContestEntryModel.saveContestEntry(entry);
	    } else {
	    	APIError.throwJsonError({userId: userId, message:"Invalid Portfolio! Can't create contest entry with invalid portfolio", errorCode: 1110});
	    }
	})
    .then(savedContestEntry => {
    	if(savedContestEntry) {
    		return Promise.all([
    			savedContestEntry,
    			exports.updateContestEntryPerformanceSummary(savedContestEntry._id, savedContestEntry.portfolio.startDate),
			]);	
    	} else {
    		APIError.throwJsonError({message: "Error adding contest entry to advisor", errorCode: 1111});	
    	}
    })
    .then(([savedContestEntry, performance]) => {

    	return Object.assign(performance, savedContestEntry.toObject());
    })
};

module.exports.getContestEntryAccessStatus = function(entryId, userId) {
	return Promise.all([
		userId ? AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}) : null,
		userId ? InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true}) : null,
		ContestEntryModel.fetchEntry({_id: entryId, deleted: false}, {fields: 'advisor'}),
		AdvisorHelper.getAdminAdvisor(userId)
	])
	.then(([advisor, investor, contestEntry, adminAdvisor]) => {

		if(!advisor && userId) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1201});
		}

		if(!investor && userId) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1301});	
		}

		if(!contestEntry) {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});	
		}

		return  {
			isAdmin: advisor && adminAdvisor ? advisor.equals(adminAdvisor._id) : false,
			isOwner: advisor && contestEntry.advisor ? advisor.equals(contestEntry.advisor) : false
		};
	});
};

module.exports.isUserAuthorizedToViewContestEntryDetail = function(entryId, userId) {
	return exports.getContestEntryAccessStatus(entryId, userId)
	.then(contestEntryAccessStatus  => {
		return  Object.assign({authorized : contestEntryAccessStatus.isAdmin || contestEntryAccessStatus.isOwner}, contestEntryAccessStatus); 
	});
}

module.exports.isUserAuthorizedToViewContestEntrySummary = function(entryId, userId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert: true}),
		ContestEntryModel.fetchEntry({_id: entryId, deleted:false}, {fields:'advisor prohibited'})])
	.then(([advisor, contestEntry])  => {
		if(advisor && contest) {
			const advisorId = advisor._id;
			
			//PERSONAL or subscribers
			//get to see expanded portfolio if chosen
			return contestEntry.advisor.equals(advisorId) || (contestEntry.prohibited == false)
				
		} else if(!advisor) {
			APIError.throwJsonError({message:"Advisor not found", errorCode: 1201});
		} else if (!contestEntry) {
			APIError.throwJsonError({message:"Advice not found", errorCode: 1101});
		} 
	});
}

/*
* Send request to Julia Server to validate contest entry
*/
module.exports.validateContestEntry = function(contestEntry, options) {
	var currentContestEntry = _.get(contestEntry, 'current', null);

	if(!currentContestEntry) {
		return {valid: false, message: "Contest entry null/not present"};
	}
	
	var oldContestEntry = _.get(contestEntry, 'old', "") || "";

	const validityRequirements = _getContestEntryOptions(_.get(currentContestEntry, 'portfolio.benchmark.ticker', ""));
	
	if (!validityRequirements) {
		return {valid: false, message: "Invalid benchmark"};
	}

	return new Promise((resolve, reject) => {
		var msg = JSON.stringify({
			action:"validate_contest_entry", 
			entry: currentContestEntry,
			lastEntry: oldContestEntry,
			dollarPosition: _.get(options, 'dollarPosition', false)
		});

		WSHelper.handleMktRequest(msg, resolve, reject);

    })
    .then(preliminaryContestEntryValidity => {
    	console.log(preliminaryContestEntryValidity);

    	let valid = preliminaryContestEntryValidity;
    	let validity = {};

    	if (config.get('validate_contest_entry_full')) {
	    	if (preliminaryContestEntryValidity) {
	    		var portfolio = contestEntry.portfolio;
	    		var oldPortfolio = oldContestEntry ? oldContestEntry.portfolio : null; 
	    		return Promise.all([
	    			PortfolioHelper.computeUpdatedPortfolioForPrice(portfolio),
	    			oldPortfolio ? PortfolioHelper.computeUpdatedPortfolioForPrice(oldPortfolio) : null
    			])
	    		.then(([updatedPortfolio, updatedOldPortfolio]) => {
	    			if (updatedPortfolio) {
	    				return _validateContestEntryFull(updatedPortfolio, validityRequirements.portfolio, updatedOldPortfolio)
	    				.then(validityStatus => {

	    					var validityStatusObj = Object.assign({}, ...validityStatus);

	    					let valid = true;

	    					Object.keys(validityStatusObj).forEach(key => {
    							valid = valid && validityStatusObj[key].valid; 
    						});

							return {valid: valid, detail: validityStatusObj};	
	    				});
						
	    			} else {
	    				APIError.throwJsonError({message: "Invalid portfolio (Validate Advice)"})
	    			}
	    		});
			} else {
				return {valid: false, detail: {'PRELIMINARY_CHECK': {valid: false}}};
			}
		} else {
			return {valid: preliminaryContestEntryValidity, detail: {'PRELIMINARY_CHECK': {valid: preliminaryContestEntryValidity}}};
		}
    });
};

module.exports.updateContestEntryPerformanceSummary = function(entryId, date) {
	return PerformanceHelper.computeContestEntryPerformanceSummary(entryId, date)
	.then(contestEntryPerformanceSummary => {
		return ContestEntryModel.updatePerformance({_id: entryId}, contestEntryPerformanceSummary);
	})
	.then(contestEntry => {
		if (contestEntry) {
			return {performanceSummary: contestEntry.performanceSummary};
		} else{
			return {performanceSummary: null};
		}
	});
};

/*
* Function to get contest entry portfolio (uses populateAvg flag to populate average price)
*/
module.exports.getContestEntryPortfolioHistory = function(entryId, date) {
	let portfolioId;
	
	return ContestEntryModel.fetchEntry({_id: entryId}, {portfolio:1})
	.then(contestEntry => {  
		if (contestEntry) {
			portfolioId = contestEntry.portfolio;
			return PortfolioHelper.getPortfolioHistory(portfolioId, date);
		} else {
			APIError.throwJsonError({message: "Contest entry not found"});
		}
	})
	.then(rawHistory => {
		return Promise.map(rawHistory.history, function(portfolio) {
			var endDate = _.get(portfolio, 'endDate', DateHelper.getCurrentDate());
			//Using portfolio history just for dates
			//Now getting updated portfolio for a particular end date
			return PortfolioHelper.getUpdatedPortfolioWithAveragePrice(portfolioId, {}, endDate)
			.then(portfolio => {
				return portfolio.detail;
			})
		});
	});
};

/*
* Function to get contest entry portfolio (uses populateAvg flag to populate average price)
*/
module.exports.getContestEntryPortfolio = function(entryId, options, date) {
	return ContestEntryModel.fetchEntry({_id: entryId}, {portfolio:1})
	.then(contestEntry => {  
		if (contestEntry) {
			let portfolioId = contestEntry.portfolio;
			return options && options.populateAvg ? 
				PortfolioHelper.getUpdatedPortfolioWithAveragePrice(portfolioId, date) : 
				PortfolioHelper.getUpdatedPortfolioForPrice(portfolioId, {}, date);
		} else {
			APIError.throwJsonError({message: "Advice not found"});
		}
	});
};

module.exports.getContestEntryPnlStats = function(entryId, date) {
	return exports.getContestEntryPortfolio(entryId, date)
	.then(contestEntryPortfolio => {
		if (contestEntryPortfolio && contestEntryPortfolio.pnlStats) {
			return contestEntryPortfolio.pnlStats;
		} else {
			return {};
		}
	});
};