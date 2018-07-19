/*
* @Author: Shiv Chawla
* @Date:   2018-03-05 12:10:56
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-07-19 12:41:20
*/
'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
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

const adviceRequirements = require('../../constants').benchmarkUniverseRequirements;

function _getAdviceOptions(benchmark) {
	return adviceRequirements[benchmark];
}

function _filterActive(objs) {
	return objs ? objs.filter(item => {return item.active == true}).length : 0;	
} 

function _getSuggestedAdviceName_contestOnly(benchmark) {
	return new Promise(resolve => {
		AdviceModel.countAdvices({contestOnly: true})
		.then(count => {
			resolve(`Contest Entry#${count + 1} - ${benchmark}`);
		})
		.catch(err => {
			console.log("Can't count advices!! Generating Random Name");
			resolve(Math.random().toString(36));
		})
	});
}

//HELPER FUNCTION -- looks weird
module.exports.saveAdvice = function(advice, advisorId, effectiveStartDate, userDetails) {
	return Promise.all([
		PortfolioHelper.savePortfolio(advice.portfolio, true),
		advice.contestOnly ? _getSuggestedAdviceName_contestOnly(_.get(advice, 'portfolio.benchmark.ticker', 'NIFTY_50')) : advice.name
	])
	.then(([port, adviceName]) => {

		if(port) {
			const adv = {
				name: adviceName, //This is suggested in case of contest entry
				rebalance: advice.rebalance,
				maxNotional: advice.maxNotional,
				advisor: advisorId,
		       	portfolio: port._id,
		       	createdDate: new Date(),
		       	//here advice start date should be last valid trading date
		       	startDate: effectiveStartDate, 
		       	updatedDate: new Date(),
				public: advice.public,
				contestOnly: advice.contestOnly,
				investmentObjective: advice.investmentObjective,
				//Approval is required only for NON-CONTEST (PUBLIC) entries
				approvalRequested: advice.contestOnly ? false : advice.public
			};

		    return AdviceModel.saveAdvice(adv);
	    } else {
	    	APIError.throwJsonError({userId: userId, message:"Invalid Portfolio! Can't create advice with invalid portfolio", errorCode: 1110});
	    }
	})
    .then(savedAdvice => {
    	if(savedAdvice) {
    		return Promise.all([
    			savedAdvice,
    			exports.updateAdviceAnalyticsAndPerformanceSummary(savedAdvice._id, savedAdvice.portfolio.startDate),
    			//savedAdvice.public ? sendEmail.sendAdviceStatusEmail({name: advice.name, pending: true, adviceId: advice._id}, userDetails) : true
			]);	
    	} else {
    		APIError.throwJsonError({message: "Error adding advice to advisor", errorCode: 1111});	
    	}
    })
    .then(([savedAdvice, analyticsAndPerformance]) => {
    	return Object.assign(analyticsAndPerformance, savedAdvice.toObject());
    })
};

module.exports.getAdviceAccessStatus = function(adviceId, userId) {
	return Promise.all([
		userId ? AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}) : null,
		userId ? InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true}) : null,
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: 'advisor subscribers followers'}),
		AdvisorHelper.getAdminAdvisor(userId)
	])
	.then(([advisor, investor, advice, adminAdvisor]) => {

		if(!advisor && userId) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1201});
		}

		if(!investor && userId) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1301});	
		}

		if(!advice) {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});	
		}

		var activeSubscribers = advice.subscribers.filter(item => {return item.active == true});
		var activeFollowers = advice.followers.filter(item => {return item.active == true});

		var subscribedIndex = investor ? activeSubscribers.map(item => item.investor.toString()).indexOf(investor._id.toString()) : -1;
		var isSubscribed = subscribedIndex != -1;

		let subscriptionDetail = {};

		if (isSubscribed) {
			var subscriber = activeSubscribers[subscribedIndex];
			var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds
			subscriptionDetail = {
				unsubscriptionPending: subscriber.discontinueRequested,
				subscriptionStartDate: subscriber.startDate,
				subscriptionEndDate: subscriber.endDate,
				subscriptionPendingDays: subscriber.endDate && subscriber.startDate ? Math.round(Math.abs((subscriber.endDate.getTime() - subscriber.startDate.getTime())/(oneDay))) : -1,
			};
		}

		var isFollowing = investor ? activeFollowers.map(item => item.investor.toString()).indexOf(investor._id.toString()) != -1 : false;

		return  Object.assign({subscriptionDetail: subscriptionDetail}, {
			isAdmin: advisor && adminAdvisor ? advisor.equals(adminAdvisor._id) : false,
			isOwner: advisor && advice.advisor ? advisor.equals(advice.advisor) : false,
			isFollowing: isFollowing,
			isSubscribed: isSubscribed,
		});
	});
};

module.exports.computeAdviceSubscriptionDetail = function(adviceId, userId) {
	
	return Promise.all([
		AdviceModel.fetchAdvice({_id:adviceId}, {field:'advisor subscribers followers'}),
		exports.getAdviceAccessStatus(adviceId, userId)
	])
	.then(([advice, adviceAccessStatus]) => {
		
		if(!advice) {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});	
		}

		var activeSubscribers = advice.subscribers.filter(item => {return item.active == true});
		var activeFollowers = advice.followers.filter(item => {return item.active == true});
		var numSubscribers = activeSubscribers.length;
		var numFollowers = activeFollowers.length;
		
		return Object.assign({
			numFollowers: numFollowers,
			numSubscribers: numSubscribers}, adviceAccessStatus);
	});
};

module.exports.isUserAuthorizedToViewAdviceDetail = function(adviceId, userId) {
	return exports.getAdviceAccessStatus(adviceId, userId)
	.then(adviceAccessStatus  => {
		return  Object.assign({authorized : adviceAccessStatus.isAdmin || adviceAccessStatus.isOwner || adviceAccessStatus.isSubscribed}, adviceAccessStatus); 
	});
}


module.exports.isUserAuthorizedToViewAdviceSummary = function(adviceId, userId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert: true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor prohibited public subscribers'})])
	.then(([advisor, advice])  => {
		if(advisor && advice) {
			const advisorId = advisor._id;
			
			//PERSONAL or subscribers
			//get to see expanded portfolio if chosen
			return advice.advisor.equals(advisorId) || (advice.public == true && advice.prohibited == false)
				
		} else if(!advisor) {
			APIError.throwJsonError({message:"Advisor not found", errorCode: 1201});
		} else if (!advice) {
			APIError.throwJsonError({message:"Advice not found", errorCode: 1101});
		} 
	});
}

module.exports.computeAdviceAnalytics = function(adviceId, date) {
	let subscribers;
	let followers;
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'subscribers followers analytics'})
	.then(advice => {
		if (advice) {
			var analyticsLastTwoDays = advice.analytics ? advice.analytics.slice(-2) : [];
			var currentDate = DateHelper.getCurrentDate();

			var currentDayData = analyticsLastTwoDays.length > 1 ? analyticsLastTwoDays[1] : analyticsLastTwoDays.length > 0 ? analyticsLastTwoDays[0] : null;
			var lastDayData = analyticsLastTwoDays.length > 1 ? analyticsLastTwoDays[0] : null;

			var datePresent = false;
			if (currentDayData) {
				datePresent =  currentDayData.date ? DateHelper.compareDates(currentDayData.date, currentDate) == 0 : false;
			}

			var numSubscribers = _filterActive(advice.subscribers);
			var numFollowers = _filterActive(advice.followers);
			var dailyChgSubscribers = datePresent ? 
					numSubscribers - (lastDayData ? lastDayData.numSubscribers : 0) :
					numSubscribers - (currentDayData ? currentDayData.numSubscribers : 0); 

			var dailyChgFollowers = datePresent ? 
					numFollowers - (lastDayData ? lastDayData.numFollowers : 0) :
					numFollowers - (currentDayData ? currentDayData.numFollowers : 0); 
			
			
			return {
				date: currentDate,
				numSubscribers: numSubscribers,
				numFollowers: numFollowers,
				dailyChgFollowers: dailyChgFollowers,
				dailyChgSubscribers: dailyChgSubscribers
			};
		
		} else {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});
		}
	}); 
};

//RECALCULATE IS NOT USED - 23/03/2018
module.exports.getAdviceAnalytics = function(adviceId, recalculate) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio latestAnalytics'})
	.then(advice => {
		if (!advice.latestAnalytics || recalculate) {
			return exports.computeAdviceAnalytics(adviceId);
		} else {
			return advice.latestAnalytics;
		}
	});
};


function _validateAdviceFull(updatedPortfolio, validityRequirements) {
	var fields = Object.keys(validityRequirements);
	var positions = _.get(updatedPortfolio, 'detail.positions', null);
	var benchmark = _.get(updatedPortfolio, 'benchmark')
	return Promise.map(fields, function(field) {


		let validity = {valid: true};
		if(field == 'MAX_NET_VALUE') {
			//Check for NET VALUE limit
			var netValue = _.get(updatedPortfolio, 'pnlStats.netValue', 0.0);
			var maxNav = _.get(validityRequirements, 'MAX_NET_VALUE', 0.0);

			if (maxNav > 0 && netValue > 1.05*maxNav) {
				validity = {valid: false, message:`Portfolio Value of ${netValue} is greater than ${maxNav}`};
			} 
		} else if(field == 'MIN_POS_COUNT') {
			//Check for POSITION COUNT and STOCK EXPOSURE limit
			if (positions) {
				var minPosCount = _.get(validityRequirements, 'MIN_POS_COUNT', 5);
				if (positions.length < minPosCount) {
					validity = {valid: false, message:`Position count is less than ${minPosCount}`};
				}
			}
		} else if(field == 'MAX_STOCK_EXPOSURE') {

			try {
				var maxPositionExposure = _.get(validityRequirements, 'MAX_STOCK_EXPOSURE', 1.0);
				
				if (positions) {
					positions.forEach(item => {
						if (item.weightInPortfolio > maxPositionExposure) {
							validity = {valid: false, message:`Exposure in ${item.security.ticker} is greater than ${maxPositionExposure*100}%`};
							throw new Error("Invalid");
						}
					});
				}
			} catch(err) {
				
			}				
		} else if (field == 'MIN_SECTOR_COUNT') {
			//Check for SECTOR COUNT limit
			var sectors = _.uniq(positions.map(item => _.get(item, 'security.detail.Sector', "")));
			var minSectorCount = _.get(validityRequirements, 'MIN_SECTOR_COUNT', 0)
			
			if (sectors.length < minSectorCount) {
				validity = {valid: false, message:`Sector count is less than ${minSectorCount}`};
			}
		} else if (field == 'MAX_SECTOR_COUNT') {
			//Check for SECTOR COUNT limit
			var sectors = _.uniq(positions.map(item => _.get(item, 'security.detail.Sector', "")));
			var maxSectorCount = _.get(validityRequirements, 'MAX_SECTOR_COUNT', 100);
			
			if (sectors.length > maxSectorCount) {
				validity = {valid: false, message:`Sector count is greater than ${maxSectorCount}`};
			} 
		} else if (field == 'MAX_SECTOR_EXPOSURE') {
			//Check for SECTOR EXPOSURE limit
			try {

				var sectors = _.uniq(positions.map(item => _.get(item, 'security.detail.Sector', "")));
				var maxSectorExposure = _.get(validityRequirements, 'MAX_SECTOR_EXPOSURE', 1.0);
				let sectorExposure = {};
				positions.forEach(item => {
					var sector = _.get(item, 'security.detail.Sector', "");
					if (sector in sectorExposure) {
						sectorExposure[sector] += item.weightInPortfolio; 
					} else {
						sectorExposure[sector] = item.weightInPortfolio;
					}
				});

				sectors.forEach(sector => {
					if (sector in sectorExposure && sector != "") {
						if (sectorExposure[sector] > maxSectorExposure) {
							validity = {valid: false, message:`Exposure in ${sector.toUpperCase()} sector is greater than ${maxSectorExposure*100}%`};
							throw new Error("Invalid");
						}
					}
				});
			} catch(err) {
			}
			
		} else if (field == 'STOCK_LIST') {

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

/*
* Send request to Julia Server to validate advice 
*/
module.exports.validateAdvice = function(advice, oldAdvice) {

	const validityRequirements = _getAdviceOptions(_.get(advice, 'portfolio.benchmark.ticker', ""));
	
	if (!validityRequirements) {
		return {valid: false, message: "Invalid benchmark"};
	}

	return new Promise((resolve, reject) => {
		var msg = JSON.stringify({action:"validate_advice", 
            						advice: advice,
            						lastAdvice: oldAdvice ? oldAdvice : ""})

		WSHelper.handleMktRequest(msg, resolve, reject);

    })
    .then(preliminaryAdviceValidity => {
    	let valid = preliminaryAdviceValidity;
    	let validity = {};

    	if (config.get('validate_advice_full')) {
	    	if (preliminaryAdviceValidity) {
	    		var portfolio = advice.portfolio;
	    		return PortfolioHelper.computeUpdatedPortfolioForPrice(portfolio)
	    		.then(updatedPortfolio => {
	    			if (updatedPortfolio) {
	    				return _validateAdviceFull(updatedPortfolio, validityRequirements.portfolio)
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
			return {valid: preliminaryAdviceValidity, detail: {'PRELIMINARY_CHECK': {valid: preliminaryAdviceValidity}}};
		}
    });
};

module.exports.updateAdviceAnalyticsAndPerformanceSummary = function(adviceId, date) {
	return Promise.all([
			exports.computeAdviceAnalytics(adviceId, date),
			PerformanceHelper.computeAdvicePerformanceSummary(adviceId, date)
	])
	.then(([adviceAnalytics, advicePerformanceSummary]) => {
		return AdviceModel.updateAnalyticsAndPerformance({_id: adviceId}, {analytics: adviceAnalytics, performanceSummary: advicePerformanceSummary});
	})
	.then(advice => {
		if (advice) {
			return {latestAnalytics: advice.latestAnalytics, performanceSummary: advice.performanceSummary};
		} else{
			return {latestAnalytics: null, performanceSummary: null};
		}
	});
};
