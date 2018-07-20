/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-07-13 20:32:06
*/

'use strict';
const _ = require('lodash');
const UserModel = require('../../models/user');
const ContestModel = require('../../models/Marketplace/Contest');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const Promise = require('bluebird');
const config = require('config');
const PortfolioHelper = require("../helpers/Portfolio");
const PerformanceHelper = require("../helpers/Performance");
const SecurityHelper = require("../helpers/Security");
const AdviceHelper = require("../helpers/Advice");
const APIError = require('../../utils/error');
const DateHelper = require('../../utils/Date');
const sendEmail = require('../../email');

//NOT IN USE
//NEEDS MORE CONTEMPLATION
function _getEffectiveAdviceStartDate(selectedStartDate) {
	
	var currentDate = DateHelper.getCurrentDate();
	if (DateHelper.compareDates(selectedStartDate, currentDate) == 1) {
		return selectedStartDate;
	}
	
	return Promise.all([
		SecurityHelper.getStockLatestDetail({ticker: "NIFTY_50"}, "EOD"),
		SecurityHelper.getStockLatestDetail({ticker: "NIFTY_50"}, "RT")
	])
	.then(([eodLatestDetail, rtLatestDetail]) => {

		var eodDate = eodLatestDetail ? DateHelper.getDate(eodLatestDetail.Date) : null;
		var rtDate = rtLatestDetail ? DateHelper.getDate(rtLatestDetail.date) : null;

		//All of this logic breaksdown on a trading date but trading hasn't started yet 
		// in such a case, date will be lastDate
		if (rtDate && eodDate) {
			if (DateHelper.compareDates(rtDate, eodDate) == 1) {
				return rtDate;
			} else {
				return eodDate;
			}
		}

		if (rtDate) {
			return rtDate;
		}

		if (eodDate) {
			return eodDate;
		}

		return selectedStartDate;
	});
};

function _findFirstValidPortfolio(adviceId, date, attempts) {
	var nDate = DateHelper.getDate(date);
	nDate.setDate(nDate.getDate() + 1);

	return PortfolioHelper.getAdvicePortfolio(adviceId, nDate)
	.then(portfolioForDate => {
		if (portfolioForDate && portfolioForDate.detail) {
			return portfolioForDate;
		} else {
			return attempts > 0 ? _findFirstValidPortfolio(adviceId, nDate, attempts - 1) : null;	
		}
	});
}

module.exports.createAdvice = function(args, res, next) {
	const userId = args.user._id;
	const advice = args.body.value.advice;
	const operation = _.get(args, 'body.value.action', "validate");

	var advisorId = '';
	let effectiveStartDate;

	//Any one can create an advice
	return AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true})
	.then(advisor => {
		if(advisor) {
			advisorId = advisor._id;
			return Promise.all([
				AdviceModel.fetchAdvices({advisor: advisorId, deleted:false}, {fields:'_id name'}),
				_getEffectiveAdviceStartDate(DateHelper.getDate(advice.portfolio.detail.startDate))
			])
		} else {
			APIError.throwJsonError({message:"Advisor not found", errorCode: 1201});
		}
	})
	.then(([[advices, ct], effStartDate]) => {
		//Update effective start date (in portfolio as well)
		effectiveStartDate = effStartDate;
		advice.portfolio.detail.startDate = effStartDate;

		var numSameNameAdvices = advices.filter(item => {return item && item.name == advice.name;}).length;
		if (numSameNameAdvices > 0) {
			APIError.throwJsonError({message: "Advice exists with same name"});
		}

		if(advices.length < config.get('max_advices_per_advisor')) {
			return AdviceHelper.validateAdvice(advice, "");
		} else {
			APIError.throwJsonError({advisorId: advisorId, message:"Advice limit exceed. Can't add more advices.", errorCode: 1109});
		}
	})
	.then(validity => {
		if(validity.valid && operation == "create") {
			return AdviceHelper.saveAdvice(advice, advisorId, effectiveStartDate, args.user);
		} else if (!validity.valid && operation == "create") {
			APIError.throwJsonError({message: "Invalid advice", detail: validity.detail, errorCode: 1108});
		} else if (operation == "validate") {
			return validity;
		} else {
			APIError.throwJsonError({message: "Illegal action requested while creating advice"});
		}
	})
	.then(finalOutput => {
		return res.status(200).send(finalOutput);
	})
	.catch(err => {
		return res.status(400).send(err.message);
    });
};

module.exports.updateAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	const newAdvice = args.body.value;
	
	let advicePortfolioId;
	let isPublic;

	var adviceFields = 'advisor public portfolio name investmentObjective rebalance maxNotional approvalRequested latestApproval';

	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: adviceFields, populate: 'portfolio'})
	])
	.then(([advisor, advice]) => {

		if(advisor && advice) {
			if(advice.advisor.equals(advisor._id)) {

				let allowedKeys;
				if (advice.public == false || (advice.public === true && advice.approvalRequested === false && advice.latestApproval.status === false)) {
					allowedKeys = ['public', 'name', 'investmentObjective', 'portfolio', 'rebalance', 'maxNotional']; 
				} else {
					allowedKeys = ['portfolio']; 
				}

				Object.keys(newAdvice).forEach(key => {
					// if (key != "portfolio") {
					// 	if(allowedKeys.indexOf(key) == -1 && newAdvice[key] !== advice[key]) {
					// 		APIError.throwJsonError({message:"Advisor not allowed to modify " + key, errorCode:1106}); 
					// 	}
					// } 
					if (allowedKeys.indexOf(key) === -1) {
						delete newAdvice[key];
					}
				});

				isPublic = advice.public && advice.latestApproval.status;

				//If updating a public advice's PORTFOLIO
				if (Object.keys(newAdvice).indexOf["portfolio"] != -1) {
					var newStartDate = DateHelper.getDate(newAdvice.portfolio.detail.startDate);
					var rebalanceFrequency = advice.rebalance;
					
					var nextValidDate = DateHelper.getCurrentDate();

					if (isPublic) {
						if (rebalanceFrequency == "Daily") {
							nextValidDate = DateHelper.getNextWeekday();
						} else if (rebalanceFrequency == "Weekly") {
							//Get the nextWeek Monday
							nextValidDate = DateHelper.getFirstMonday("1W");
						} else if(rebalanceFrequency == "Bi-Weekly") {
							//Get the monday after 2 weeks
							nextValidDate = DateHelper.getFirstMonday("2W");
						} else if(rebalanceFrequency == "Monthly") {
							//Get 1st Monday of next Month
							nextValidDate = DateHelper.getFirstMonday("1M");
						} else if(rebalanceFrequency == "Quartely") {
							//Get 1st Monday of after 3 months Month
							nextValidDate = DateHelper.getFirstMonday("3M");
						}

						if (DateHelper.compareDates(newStartDate, nextValidDate) != 0) {
							APIError.throwJsonError({message: `Invalid start date. Valid start date: ${nextValidDate}`});
						}
					} else {
						if (DateHelper.compareDates(newStartDate, nextValidDate) == -1 || newStartDate.getDay() == 0 || newStartDate.getDay() == 6) {
							APIError.throwJsonError({message: `Invalid start date. Valid start date: ${nextValidDate} or higher`});
						}
					} 
				}

				advicePortfolioId = advice.portfolio._id;
				return 	isPublic ? AdviceHelper.validateAdvice(newAdvice, advice) : AdviceHelper.validateAdvice(newAdvice);
					
			
			} else {
				APIError.throwJsonError({message: "Advisor not authorized to update", errorCode: 1107});
			}
		} else {
			APIError.throwJsonError({userId:userId, adviceId:adviceId, message: "Advice not found", errorCode: 1101});
		}
	})
	.then(validAdvice => {
		var adviceUpdates = Object.assign({}, newAdvice, {approvalRequested: true});
		
		if (!isPublic && adviceUpdates.portfolio) {
			adviceUpdates.startDate = DateHelper.getDate(adviceUpdates.portfolio.detail.startDate);
		}

		delete adviceUpdates.portfolio;

		if (validAdvice.valid) {
			return Promise.all([PortfolioModel.updatePortfolio({_id: advicePortfolioId}, newAdvice.portfolio, {new:true, fields: 'detail', appendHistory: isPublic}), 
				AdviceModel.updateAdvice({_id: adviceId}, {$set: adviceUpdates}, {new:true, fields: adviceFields})]);
		} else {
			APIError.throwJsonError({message: "Invalid Advice", detail: validAdvice.detail, errorCode: 1108});
		}
	})
	.then(([updatedPortfolio, updatedAdvice]) => {
		updatedAdvice.portfolio = updatedPortfolio;
		return Promise.all([
			updatedAdvice,
			AdviceHelper.updateAdviceAnalyticsAndPerformanceSummary(updatedAdvice._id)
		]); 
	})
	.then(([advice, analyticsAndPerformance]) => {
    	return res.status(200).send(Object.assign(analyticsAndPerformance, advice.toObject()));
    })
	.catch(err => {
		return res.status(400).json(err.message);	
	})
};

//Advices fetched should adhere to following restrictions
//1. current date < end date of advice
//2. Advice is public
module.exports.getAdvices = function(args, res, next) {
	const userId = args.user ? args.user._id : null;
    const options = {};
	options.skip = args.skip.value;
    options.limit = args.limit.value;
    options.order = args.order.value || 1;

    const performanceType = args.performanceType.value;
	var pType = "simulated";
	if(performanceType) {
		pType = performanceType;
	}
	
    let count;
    var orderParam = args.orderParam.value || `rating.${pType}`;
	if (["return", "volatility", "sharpe", "maxLoss", "currentLoss", "dailyChange", "netValue"].indexOf(orderParam) != -1) {
		if (orderParam == "return") {
			orderParam = "annualReturn"
		}

		if (orderParam == "dailyChange") {
			orderParam = "dailyNAVChangeEODPct";
		}

		orderParam = `performanceSummary.${pType}.${orderParam}`;
	} else if(["numFollowers", "numSubscribers"].indexOf(orderParam) !=-1) {
		orderParam = `latestAnalytics.${orderParam}`;
	} else if(["rating"].indexOf(orderParam) != -1) {
		orderParam = `rating.${pType}`;
	}

	options.orderParam = orderParam;

    options.fields = 'name createdDate updatedDate advisor public approvalRequested latestApproval prohibited rebalance maxNotional performanceSummary rating startDate';

	var query = {deleted: false};
	
	const contestOnly = args.contestOnly.value;
	if (contestOnly){
		query.contestOnly = {$exists: true, $eq: true};
	} else {
		query = {...query, $or: [{contestOnly:{$exists: false}}, {contestOnly: {$exists: true, $eq: false}}]};
	}
	

    var performanceFilters = {netValue: {field: "netValueEOD", min: 0, max: 200000}, 
								sharpe: {field:"sharpe", min: -10, max: 10}, 
								volatility: {field:"volatility", min: 0, max: 0.5}, 
								return: {field:"annualReturn", min: -1, max: 1},  
								maxLoss: {field:"maxLoss", min: -1, max: 0},  
								currentLoss: {field: "currentLoss", min: -1, max: 0}, 
								beta: {field: "beta", min: -1, max: 2}
							};

	Object.keys(performanceFilters).forEach(item => {
		var majorKey = `performanceSummary.${pType}.`; //performanceSummary.current.return
    	if(args[item]) {
    		var values = args[item].value;
	    	var valueCategories = values.split(",").map(item => parseFloat(item.trim()));
	    	var key = majorKey + performanceFilters[item].field;
	    	if (valueCategories.length > 0 && valueCategories[0] > performanceFilters[item].min) {
	    		query = {'$and': [query, {'$or': [{[key]: {'$exists':false}}, {[key]: {'$gte': valueCategories[0]}}]}]};
    		}

    		if (valueCategories.length > 1 && valueCategories[1] < performanceFilters[item].max) {
	    		query = {'$and': [query, {'$or': [{[key]: {'$exists':false}}, {[key]: {'$lte': valueCategories[1]}}]}]};
    		}
		}
    });

    if (args["rating"]){
    	var key = `rating.${pType}`; 
    	var values = args["rating"].value;
    	var valueCategories = values.split(",").map(item => parseFloat(item.trim()));
    	
    	query = valueCategories.length > 0 ? {'$and': [query, {'$or': [{[key]: {'$exists':false}}, {[key]: {'$gte': valueCategories[0]}}]}]} : query; 
    	query = valueCategories.length > 1 ? {'$and': [query, {'$or': [{[key]: {'$exists':false}}, {[key]: {'$lte': valueCategories[1]}}]}]} : query; 
    }

    const following = args.following.value;
    const subscribed = args.subscribed.value;
    const personal = args.personal.value;
	const advisorId = args.advisor.value;
	
	
    const search = args.search.value;
    if (search) {
    	var nearMatch = `^(.*?(${search})[^$]*)$`;
        query.name = {$regex: nearMatch, $options: "i"};
    }

    const approved = args.approved.value ? args.approved.value : "0,1,-1";

    if(approved) {
        var approvedCategories = approved.split(",");    
        //query.approved = {$in: approvedCategories};
        var unappr = approvedCategories.indexOf("0") != -1 ? true : false;
        var	appr = approvedCategories.indexOf("1") != -1 ? true : false;
        var	pending = approvedCategories.indexOf("-1") != -1 ? true : false;

       	var approvalQuery = [];

        if (unappr) {
			approvalQuery.push({'latestApproval.status': false});
        }

        if (appr) {
        	approvalQuery.push({'latestApproval.status': true});
        }

        if (unappr || pending) {
        	approvalQuery.push({'latestApproval.status': {$exists: false}});
        }

        query = {$and: [query, {$or: approvalQuery}]}; 
    }

    const rebalance = args.rebalance.value;
    if(rebalance) {
        var rebalanceCategories = rebalance.split(",");    
        query.rebalance = {$in: rebalanceCategories};
    }

   	let userInvestorId;
   	let userAdvisorId;
   	let isUserAdmin;
    return Promise.all([
    	userId ? AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true}) : null,
		userId ? InvestorModel.fetchInvestor({user:userId}, {fields: '_id', insert: true}) : null,
		userId ? UserModel.fetchUsers({email:{'$in': config.get('admin_user')}}, {fields:'_id'}) : []
	])
    .then(([advisor, investor, admins]) => {
    	
		if (userId && admins && admins.map(item => item._id.toString()).indexOf(userId.toString()) !=-1) {
			isUserAdmin = true;
		}

    	userAdvisorId = advisor ? advisor._id : null;
    	userInvestorId = investor ? investor._id : null; 

    	if (following && userInvestorId) {
	        query.followers = {'$elemMatch':{investor: userInvestorId, active:true}};
	    } 

	    if(subscribed && userInvestorId){
	        query.subscribers = {'$elemMatch':{investor: userInvestorId, active:true}};
		}

	    var advisorQuery = [];
	    if(!advisorId) {
			var personalCategories = personal ? personal.split(",") : ["0","1"];
	 		
	    	if (personalCategories.indexOf("1") !=-1) {
	    		advisorQuery.push({advisor: userAdvisorId});
	    	}

	    	if (personalCategories.indexOf("0") !=-1) {
	    		//Only show advices starting after today for other advisors
	    		let q = {};
	    		if (!isUserAdmin) {
	    			q = {'latestApproval.status': true};
	    		}

	    		advisorQuery.push({$and: [Object.assign(q, {advisor:{'$ne': userAdvisorId}, public: true, prohibited: false}), 
	    								{$or:[{startDate: {$lte: DateHelper.getCurrentDate()}}, 
    								      	{startDate: {$exists: false}}
								      	]}
						      		]});
	    		
	    	}

	    	//query = {'$and': [query, {'$or': advisorQuery}]}
	    } 
	    else if(advisorId) {
	    	query.advisor = advisorId;
	    	if (!userAdvisorId.equals(advisorId)) {
	    		query.public = true;
	    		query.prohibited = false;	

	    		query = {$and: [query, {'latestApproval.status':true},
							{$or:[{startDate: {$lte: DateHelper.getCurrentDate()}}, 
						      	{startDate: {$exists: false}}
					      	]}
				      	]};
	    	}
	    }

	    //  (deleted == false && subscribed == true) && 
	    //	[(advisor != self && public == true) || -- ALL
	    //  (advisor == self)   -- PERSONAL]  && 
	    //  (advisor == specific && public == true)

    	return AdviceModel.fetchAdvices(query, options);
	})
    .then(([advices, ct]) => {
    	if(advices) {
    		count = ct;
	    	return Promise.map(advices, function(advice) {
    			return Promise.all([
    				PortfolioHelper.getAdvicePnlStats(advice._id),
    				AdviceHelper.computeAdviceSubscriptionDetail(advice._id, userId)
				])
    			.then(([advicePnlStats, subscriptionDetail]) => {
    				return Object.assign(subscriptionDetail, advicePnlStats, advice.toObject());
    			});
			});
		} else {
			APIError.throwJsonError({message: "No advices found", errorCode: 1110});
		}
    })
    .then(updatedAdvices => {
    	return res.status(200).send({advices: updatedAdvices, count: count});	
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.getAdviceSummary = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user ? args.user._id : null;
	const fullperformanceFlag = args.fullperformance.value;
	
	const options = {};
	options.fields = 'name createdDate updatedDate advisor public prohibited approval latestApproval portfolio rebalance maxNotional rating investmentObjective approvalRequested contestOnly';
	options.populate = 'advisor benchmark';
	
	return Promise.all([
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, options),
		AdviceHelper.computeAdviceSubscriptionDetail(adviceId, userId)
	])
 	.then(([advice, adviceSubscriptionDetail]) => {
 		let nAdvice; 

 		if(advice && adviceSubscriptionDetail) {
	 		var accessAllowed = adviceSubscriptionDetail.isOwner || adviceSubscriptionDetail.isAdmin;
	 		var accessAllowed = accessAllowed || (!accessAllowed && advice.public == true && !advice.prohibited); 
	 		
	 		if(accessAllowed) {
				nAdvice = Object.assign(adviceSubscriptionDetail, advice.toObject());
				// nAdvice.approval = nAdvice.approval[nAdvice.approval.length - 1];
			} else {
				APIError.throwJsonError({userId: userId, adviceId: adviceId, message:"Investor not authorized to view advice", errorCode: 1113});
			}
		} else {
			APIError.throwJsonError({message:'Advice not found', errorCode: 1101});
		}

		//First fetch the latest portfolio for the advice
		//and compute performance of the same
		return _findFirstValidPortfolio(adviceId, DateHelper.getCurrentDate(), 100)
		.then(firstValidPortfolio => {

			var date = DateHelper.getCurrentDate();
			if (firstValidPortfolio && firstValidPortfolio.detail) {
				date = DateHelper.getDate(firstValidPortfolio.detail.startDate);
			}

			return Promise.all([
				nAdvice,
				PortfolioHelper.getAdvicePnlStats(adviceId, date),
				fullperformanceFlag ? PerformanceHelper.getAdvicePerformance(adviceId, date, userId) : PerformanceHelper.getAdvicePerformanceSummary(adviceId, date)
			]);	
		});
 	})
 	.then(([advice, advicePnlStats, performance]) => {
		var nAdvice = advice;

		if (fullperformanceFlag && performance) {
			const pf = performance.toObject();
			nAdvice = Object.assign({performanceSummary: pf.summary, performance: pf}, advicePnlStats, nAdvice);
		}
 		else if (!fullperformanceFlag && performance) {
			nAdvice = Object.assign({performanceSummary: performance}, advicePnlStats, nAdvice);
		}

		return res.status(200).send(nAdvice);
 	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });    
};

//API NEEDS IMPORVEMENT...FETHCING DETAIL FOR ADMIN SHOULD BE DIFFERENT
module.exports.getAdviceDetail = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	var defaultFields = 'subscribers followers createdDate updatedDate advisor rebalance maxNotional rating approval prohibited';
	const options = {};
   	options.fields = args.fields.value != "" ? args.fields.value : defaultFields;
   	options.populate = 'advisor';
	
	return AdviceHelper.isUserAuthorizedToViewAdviceDetail(adviceId, userId)
	.then(authorizationStatus => {
		if(authorizationStatus.authorized) {

			//Re-run the query after checking 
			//Add portfolio as of today to the detail
			return Promise.all([
				AdviceModel.fetchAdvice({_id:adviceId}, options),
				options.fields.indexOf("portfolio") !=-1 ? PortfolioHelper.getAdvicePortfolio(adviceId) : null
			])
		
		} else {
			APIError.throwJsonError({message:"Investor not authorized to view advice detail", errorCode: 1112});
		}
	})
	.then(([advice, advicePortfolio]) => {
		if (advicePortfolio) {
			return PortfolioHelper.computeUpdatedPortfolioForPrice(advicePortfolio)
			.then(updatedAdvicePortfolio => {
				var advicePortfolio = updatedAdvicePortfolio;
				return Object.assign(advice.toObject(), {portfolio: advicePortfolio});
			});
		} else {
			return advice;
		}
	})
	.then(finalAdvice => {
		return res.status(200).json(finalAdvice);
	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });
};


/*
* Function to get advice portfolio for a date
* Updated portfolio contains latest price (and/or average price in case of owner)
*/
module.exports.getAdvicePortfolio = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	const date = args.date.value;

	let ndate;
	return AdviceHelper.isUserAuthorizedToViewAdviceDetail(adviceId, userId)
	.then(authorizationStatus => {
		if(authorizationStatus.authorized) {
			
			ndate = !date || date == '' ? DateHelper.getCurrentDate() : DateHelper.getDate(date); 
			
			if (authorizationStatus.isSubscriber) {
				var currentDate = DateHelper.getCurrentDate();
				if (DateHelper.compareDates(ndate, currentDate) == 1) {
					APIError.throwJsonError({message: "Can't see advice portfolio for dates later than today", adviceId: adviceId});
				}
			}

			//Re-run the query after checking 
			return PortfolioHelper.getAdvicePortfolio(adviceId, {populateAvg: authorizationStatus.isOwner || authorizationStatus.isAdmin}, ndate)
			.then(portfolioForDate => {
				if (portfolioForDate && portfolioForDate.detail) {
					return portfolioForDate;
				} else {
					return authorizationStatus.isOwner ? _findFirstValidPortfolio(adviceId, ndate, 100) : null; 
				}
			})
		} else {
			APIError.throwJsonError({message:"Investor not authorized to view advice detail", errorCode: 1112});
		}
	})
	.then(updatedPortfolio => {
		return res.status(200).send(Object.assign({adviceId: adviceId}, updatedPortfolio));
	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.deleteAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: '_id advisor'})
	])
	.then(([advisor, advice]) => {
		if(advisor && advice) {
		 	var isOwner = advisor._id.equals(advice.advisor);
		 	if (isOwner) {
		 		return AdviceModel.deleteAdvice({_id: adviceId, advisor: advisor._id});
	 		} else {
	 			APIError.throwJsonError({userId: userId, message:"Advisor not authorized to delete", errorCode: 1114}); 
	 		}
		} else if(!advisor) {
			APIError.throwJsonError({userId: userId, message:"Advisor not found", errorCode: 1201}); 
		} else if(!advice){
			APIError.throwJsonError({userId: userId, message:"Advice not found", errorCode: 1101}); 
		}
	})
	.then(advice => {
		if(advice) {
			return res.status(200).send({adviceId:adviceId, message:"Advice deleted successfully"});
		} else {
			APIError.throwJsonError({userId: userId, message:"Internal error deleting advice", errorCode: 1115}); 
		}
	})
  	.catch(err => {
  		return res.status(400).send(err.message);
    });
};

module.exports.publishAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: false}, {field:'advisor name'})
	])
  	.then(([advisor, advice]) => {
  		if(advisor && advice) {			
    		const advisorId = advisor._id;

    		if(!advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor is not authorized to publish the advice", errorCode: 1102});
    		}
    		return Promise.all([
    			AdviceModel.updateAdvice({_id: adviceId}, {public: true, publishDate: new Date(), approvalRequested: true}, {new: true, fields:'_id public'}),
				sendEmail.sendAdviceStatusEmail({name: advice.name, pending: true, adviceId: adviceId}, args.user)
			]);		
		} else {
			if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found", errorCode: 1101});
			} else if(!advisor) {
				APIError.throwJsonError({userId:userId, message: "Advisor not found", errorCode: 1201});
			}
		}
	})
	.then(([advice, emailSent]) => {
		if (advice && emailSent) {
			return res.status(200).json({adviceId: adviceId, message: "Advice successfully published"}); 
		} else {
			APIError.throwJsonError({adviceId: adviceId, message: "Error publishing advice", errorCode: 1103});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.followAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	Promise.all([
  		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
  		InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true, prohibited:false}, {field:'advisor'})])
  	.then(([advisor, investor, advice]) => {
  		if(advisor && investor && advice) {			
    		const investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't follow personal advice", errorCode: 1104});
    		}

    		return AdviceModel.updateFollowers({_id: adviceId}, investorId);
						
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found", errorCode: 1301});
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found", errorCode: 1101});
			} else if(!advisor) {
				APIError.throwJsonError({userId:userId, message: "Advisor not found", errorCode: 1201});
			}
		}
	})
	.then(advice => {
		if (advice) {
			return res.status(200).json({userId: userId, adviceId: adviceId, message: "Updated wishlist successfully"}); 
		} else {
			APIError.throwJsonError({adviceId: adviceId, message: "Advice not found", errorCode: 1101});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.subscribeAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	let investorId;
  	let currentSubscriptionStatus;

  	return Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
  			InvestorModel.fetchInvestor({user: userId}, {fields: '_id', insert:true}), 
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true, prohibited: false, contestOnly: false}, {subscribers:1, advisor:1})])
  	.then(([advisor, investor, advice]) => {
  		if(advisor && investor && advice) {
  				
    		investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't subscribe to personal advice", errorCode: 1105});
    		}

    		var idx = advice.subscribers.map(item => item.investor.toString()).indexOf(investorId.toString());
    		if (idx != -1) {
    			currentSubscriptionStatus = advice.subscribers[idx].active;
    		}

    		//First find the current Subscribed Advies
    		return AdviceModel.fetchAdvices({subscribers:{$elemMatch:{investor: investorId, active: true}}}, {fields: '_id'});
						
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found", errorCode: 1301});	
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found or not eligible for subscription", errorCode: 1101});	
			} else if(!advisor) {
				APIError.throwJsonError({userId:userId, message: "Advisor not found", errorCode: 1201});
			}
		}
	})
	.then(([listSubscribedAdvices, ct]) => {
		var subscriptionAllowed = true;
		if(listSubscribedAdvices) {
			subscriptionAllowed = listSubscribedAdvices.length < config.get('max_subscription_per_investor');
		} 

		var unsubscriptionAllowed = listSubscribedAdvices.map(item => item._id.toString()).indexOf(adviceId.toString()) !=-1;
		
		if (subscriptionAllowed || unsubscriptionAllowed) {
			return AdviceModel.updateSubscribers({_id: adviceId}, investorId);
		} else {
			return null;
		}
	})
	.then(advice => {
		if (advice) {

			var idx = advice.subscribers.map(item => item.investor.toString()).indexOf(investorId.toString());
    		if (idx != -1) {
    			var newSubsriptionStatus = advice.subscribers[idx].active; 
    			if (newSubsriptionStatus && currentSubscriptionStatus) {
    				return res.status(200).json({adviceId: adviceId, message: "Unsubscription request accepted. Will unsubscribe at the end of subscription period."}); 
    			} else if(!newSubsriptionStatus && currentSubscriptionStatus) {
    				return res.status(200).json({adviceId: adviceId, message: "Unsubscribed successfully"}); 
    			} else if(newSubsriptionStatus && !currentSubscriptionStatus) {
    				return res.status(200).json({adviceId: adviceId, message: "Subscribed successfully"}); 
    			}
    		}
			
		} else {
			return res.status(200).send({message: "Advice can't be subscribed. Exceeded the limit", advice: adviceId});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.approveAdvice = function(args, res, next) {
	const userId = args.user._id;
	const adviceId = args.adviceId.value;
	const approval = args.body.value;

	return UserModel.fetchUsers({email:{'$in': config.get('admin_user')}}, {fields:'_id'})
	.then(users => {
		if (users) {
			if (users.map(item => item._id.toString()).indexOf(userId.toString()) !=-1) {
				return AdviceModel.updateApproval({_id:adviceId}, Object.assign({user: userId}, approval));
			} else {
				APIError.throwJsonError({message: "User not authorized to approve", errorCode: 1505});
			}
		} else {
			APIError.throwJsonError({message: "No authorized user found to approve", errorCode: 1501});
		}
	})
	.then(advice => {
		return res.status(200).send({message: "Approval updated successfully"});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

module.exports.approveAdviceNew = (args, res, next) => {
	const userId = _.get(args, 'user._id', 0);
	const adviceId = _.get(args, 'adviceId.value', 0);
	const approval = _.get(args, 'body.value', {});

	return Promise.all([
		UserModel.fetchUsers({email: {$in: config.get('admin_user')}}, {$fields: '_id'}),
		AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'name'})
	])
	.then(([users, advice]) => {
		if (!advice) {
			APIError.throwJsonError({message:"Advice not found"});
		}

		if (users) {
			const userIndex = _.findIndex(users, user => user._id.toString() === userId.toString());
			if (userIndex !== -1) {
				var approvalStatus = getApprovalStatus(approval.detail);
				
				//Send email to the user notifying the advice Status
				return Promise.all([
					AdviceModel.updateApprovalObj({_id: adviceId}, {user: userId, ...approval, status: approvalStatus}),
					sendEmail.sendAdviceStatusEmail({name: advice.name, status: approvalStatus, adviceId: adviceId}, args.user)
				]);
			} else {
				APIError.throwJsonError({message: "User not authorized to approve", errorCode: 1505});
			}
		} else {
			APIError.throwJsonError({message: "No authorized user found to approve", errorCode: 1501});
		}
	})
	.then(([advice, emailSent]) => {
		return res.status(200).send("Advice Approved/Rejected successfully");
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
}

module.exports.requestApproveAdvice = function(args, res, next) {
	const userId = args.user._id;
	const adviceId = args.adviceId.value;

	return Promise.all([
		AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
		AdviceModel.fetchAdvice({_id: adviceId}, {fields:'advisor name'})
	])
	.then(([advisor, advice]) => {

		if (!advice) {
			APIError.throwJsonError({message:"Advice not found"});
		}

		if (!advisor) {
			APIError.throwJsonError({message:"Advisor not found"});
		}

		var isOwner = advisor && advice ? advisor._id.equals(advice.advisor) : false;
		if(isOwner) {
			//Send email to the user notifying the advice Status
			return Promise.all([
				AdviceModel.updateAdvice({_id:adviceId}, {approvalRequested: true}, {new: true, fields:'approvalRequested'}),
				sendEmail.sendAdviceStatusEmail({name: advice.name, pending:true, adviceId: adviceId}, args.user)
			]);
		} else {
			APIError.throwJsonError({message: "Advisor not authorized", errorCode:1116});
		}
	})
	.then(([advice, emailSent]) => {
		if (advice) {
			return res.status(200).send("Approval request submitted");
		} else {
			APIError.throwJsonError({message: "Internal error updating approval status", errorCode: 1117});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

function getApprovalStatus(items) {
	let invalidIndex = 0;
	items.map(item => {
		if (!item.valid) {
			invalidIndex++;
		}
	});

	return invalidIndex === 0;
}
