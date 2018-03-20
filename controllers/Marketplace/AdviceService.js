/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-20 05:23:42
*/

'use strict';
const UserModel = require('../../models/user');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const Promise = require('bluebird');
const config = require('config');
const HelperFunctions = require("../helpers");
const PortfolioHelper = require("../helpers/Portfolio");
const PerformanceHelper = require("../helpers/Performance");
const AdviceHelper = require("../helpers/Advice");
const APIError = require('../../utils/error');

module.exports.createAdvice = function(args, res, next) {
	const userId = args.user._id;
	const advice = args.body.value;

	var advisorId='';
	
	//Any one can create an advice
	return AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true})
	.then(advisor => {
		if(advisor) {
			advisorId = advisor._id;
			return AdviceModel.fetchAdvices({advisor: advisorId, deleted:false}, {fields:'_id'})
		} else {
			APIError.throwJsonError({message:"Advisor not found", errorCode: 1201});
		}
	})
	.then(advices => {
		if(advices.length < config.get('max_advices_per_advisor')) {
			return HelperFunctions.validateAdvice(advice, "", true);
		} else {
			APIError.throwJsonError({advisorId: advisorId, message:"Advice limit exceed. Can't add more advices.", errorCode: 1109});
		}
	})
	.then(valid => {
		if(valid) {
			return PortfolioModel.savePortfolio(advice.portfolio, true);
		} else {
			APIError.throwJsonError({message: "Invalid portfolio composition", errorCode: 1405});
		}
	})
	.then(port => {
		if(port) {
			const adv = {
				name: advice.name,
				heading: advice.heading,
				description: advice.description,
				maxNotional: advice.maxNotional,
				rebalance: advice.rebalance,
				advisor: advisorId,
		       	portfolio: port._id,
		       	createdDate: new Date(),
		       	updatedDate: new Date(),
		    };
		    return AdviceModel.saveAdvice(adv);
	    } else {
	    	APIError.throwJsonError({userId: userId, message:"Invalid Portfolio! Can't create advice with invalid portfolio", errorCode: 1110});
	    }
	})
    .then(advice => {
    	if(advice) {
    		return Promise.all([
    			advice,
    			AdviceHelper.getAdvicePerformanceSummary(advice._id)
			]);
    	} else {
    		APIError.throwJsonError({message: "Error adding advice to advisor", errorCode: 1111});	
    	}
    })
    .then(([advice, performanceSummary]) => {
    	return res.status(200).send(Object.assign({latestPerformance: performanceSummary}, advice.toObject()));
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

	var adviceFields = 'advisor public portfolio name heading description maxNotional rebalance';

	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: adviceFields, populate: 'portfolio'})
	])
	.then(([advisor, advice]) => {

		if(advisor && advice) {
			if(advice.advisor.equals(advisor._id)) {

				let allowedKeys;
				if (advice.public == false) {
					allowedKeys = ['public', 'name', 'heading', 'description', 'portfolio', 'maxNotional', 'rebalance']; 
				} else {
					allowedKeys = ['portfolio']; 
				}

				Object.keys(newAdvice).forEach(key => {
					if (key != "portfolio") {
						if(allowedKeys.indexOf(key) == -1 && newAdvice[key] != advice[key]) {
							APIError.throwJsonError({message:"Advisor not allowed to modify " + key, errorCode:1106}); 
						}
					} 
				});

				isPublic = advice.public;
				advicePortfolioId = advice.portfolio._id;
				return 	isPublic ? HelperFunctions.validateAdvice(newAdvice, advice) : HelperFunctions.validateAdvice(newAdvice);
			
			} else {
				APIError.throwJsonError({message: "Advisor not authorized to update", errorCode: 1107});
			}
		} else {
			APIError.throwJsonError({userId:userId, adviceId:adviceId, message: "Advice not found", errorCode: 1101});
		}
	})
	.then(validAdvice => {
		
		var adviceUpdates = Object.assign({}, newAdvice);
		delete adviceUpdates.portfolio;

		if (validAdvice) {
			return Promise.all([PortfolioModel.updatePortfolio({_id:advicePortfolioId}, newAdvice.portfolio, {new:true, fields: 'detail'}, isPublic), 
				AdviceModel.updateAdvice({_id: adviceId}, adviceUpdates, {new:true, fields: adviceFields})]);
		} else {
			APIError.throwJsonError({message:"Advice validation failed", errorCode: 1108});
		}
	})
	.then(([updatedPortfolio, updatedAdvice]) => {
		updatedAdvice.portfolio = updatedPortfolio; 
		return res.status(200).send({advice: updatedAdvice, message: "Advice updated successfully"});
	})
	.catch(err => {
		return res.status(400).json(err.message);	
	})
};

//Advices fetched should adhere to following restrictions
//1. current date < end date of advice
//2. Advice is public
module.exports.getAdvices = function(args, res, next) {

	const userId = args.user._id;
    
    const options = {};
	options.skip = args.skip.value;
    options.limit = args.limit.value;
    options.order = args.order.value || 1;

    var orderParam = args.orderParam.value || "rating";
	if (["return", "volatility", "sharpe", "maxLoss", "currentLoss", "dailyChange", "netValue"].indexOf(orderParam) != -1) {
		orderParam = "latestPerformance."+orderParam;
	} else if(["rating", "numFollowers", "numSubscribers"].indexOf(orderParam) !=-1) {
		orderParam = "latestAnalytics."+orderParam;
	}

	options.orderParam = orderParam;

    options.fields = 'name description heading createdDate updatedDate advisor public approvalStatus maxNotional rebalance latestPerformance latestAnalytics';

    var query = {deleted: false, $or: [{prohibited:{'$exists':false}}, {prohibited: false}]};

    var performanceAnalyticsFilters = [
    	["netValue", "sharpe", "volatility", "return", "maxLoss", "currentLoss", "beta"],
    	["rating"]];

    performanceAnalyticsFilters.forEach((filterArray, i) => {
    	var majorKey = i == 0 ? 'latestPerformance.' : 'latestAnalytics.';
    	filterArray.forEach(item => {
	    	if(args[item]) {
	    		var values = args[item].value;
		    	var valueCategories = values.split(",").map(item => parseFloat(item.trim()));
		    	var key = majorKey + item;
		    	query = valueCategories.length > 0 ? {'$and': [query, {'$or': [{[key]: {'$exists':false}}, {[key]: {'$gt': valueCategories[0]}}]}]} : query; 
		    	query = valueCategories.length > 1 ? {'$and': [query, {'$or': [{[key]: {'$exists':false}}, {[key]: {'$lt': valueCategories[1]}}]}]} : query; 
			}
	    });
    });

    const following = args.following.value;
    const subscribed = args.subscribed.value;
    const personal = args.personal.value;
    const advisorId = args.advisor.value;

    const search = args.search.value;
    if (search) {
        query.$text = {$search: search};
    }

    const approved = args.approved.value;
    if(approved) {
        var approvedCategories = approved.split(",");    
        //query.approved = {$in: approvedCategories};
        var unappr = approvedCategories.indexOf("0") != -1 ? true : false;
        var	appr = approvedCategories.indexOf("1") != -1 ? true : false;

        if (!appr && unappr) {
        	query.approvalStatus = {$ne:'approved'};
        }

        if (appr && !unappr) {
        	query.approvalStatus = 'approved';
        } 
    }

    const rebalance = args.rebalance.value;
    if(rebalance) {
        var rebalanceCategories = rebalance.split(",");    
        query.rebalance = {$in: rebalanceCategories};
    }

   	let userInvestorId;
   	let userAdvisorId;

    return Promise.all([AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true}),
    		InvestorModel.fetchInvestor({user:userId}, {fields: '_id', insert: true})])
    .then(([advisor, investor]) => {
    	
    	userAdvisorId = advisor._id;
    	userInvestorId = investor._id; 

    	if (following) {
	        query.followers = {'$elemMatch':{investor: userInvestorId, active:true}};
	    } 

	    if(subscribed){
	        query.subscribers = {'$elemMatch':{investor: userInvestorId, active:true}};
	    }

	    var advisorQuery = [];
	    if(personal && !advisorId) {
			var personalCategories = personal.split(",");
	 		
	    	if (personalCategories.indexOf("1") !=-1) {
	    		//query.advisor = userAdvisorId;
	    		advisorQuery.push({advisor: userAdvisorId});
	    	}

	    	if (personalCategories.indexOf("0") !=-1) {
	    		advisorQuery.push({advisor:{'$ne': userAdvisorId}, public: true, $or:[{prohibited: {$exists: false}}, {prohibited: false}]});
	    	}

	    	query = {'$and': [query, {'$or': advisorQuery}]}

	    }

     	if(advisorId) {
	    	query.advisor = advisorId;
	    	if (!userAdvisorId.equals(advisorId)) {
	    		query.public = true;	
	    	}
	    }

	    //  (deleted == false && subscribed == true) && 
	    //	[(advisor != self && public == true) || -- ALL
	    //  (advisor == self)   -- PERSONAL]  && 
	    //  (advisor == specific && public == true)

    	return AdviceModel.fetchAdvices(query, options);
	})
    .then(advices => {
    	if(advices) {
	    	return Promise.map(advices , function(advice) {
    			return AdviceHelper.computeAdviceSubscriptionDetail(advice._id, userId)
    			.then(subscriptionDetail => {
    				return Object.assign(subscriptionDetail, advice.toObject());
    			});
			});
		} else {
			APIError.throwJsonError({message: "No advices found", errorCode: 1110});
		}
    })
    .then(updatedAdvices => {
    	return res.status(200).send(updatedAdvices);	
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.getAdviceSummary = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	
	const options = {};
	options.fields = 'name heading description createdDate updatedDate advisor public prohibited approved portfolio rebalance maxNotional';
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
			} else {
				APIError.throwJsonError({userId: userId, adviceId: adviceId, message:"Investor not authorized to view advice", errorCode: 1113});
			}
		} else {
			APIError.throwJsonError({message:'Advice not found', errorCode: 1101});
		}

		return Promise.all([
			nAdvice,
			AdviceHelper.getAdvicePerformanceSummary(adviceId),
			//AdviceHelper.getAdviceAnalytics(adviceId),
		]);

 	})
 	.then(([advice, performanceSummary, analyticsSummary]) => {
		var nAdvice = advice;

		if (performanceSummary) {
			nAdvice = Object.assign({latestPerformance: performanceSummary.summary}, nAdvice);
		}

		/*if (analyticsSummary) {
			nAdvice = Object.assign({latestAnalytics: analyticsSummary}, nAdvice);
		}*/ 

		return res.status(200).send(nAdvice);
		
 	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });    
};

module.exports.getAdviceDetail = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	var defaultFields = 'subscribers followers createdDate updatedDate advisor portfolio rebalance maxNotional';
	const options = {};
   	options.fields = args.fields.value != "" ? args.fields.value : defaultFields;
   	options.populate = 'advisor';
	
	return AdviceHelper.isUserAuthorizedToViewAdviceDetail(userId, adviceId)
	.then(allowed => {
		if(allowed) {		
			if (options.fields.indexOf('portfolio') != -1) {
				options.populate = options.populate.concat(' portfolio');
			}

			//Re-run the query after checking 
			return AdviceModel.fetchAdvice({_id:adviceId}, options);
		
		} else {
			APIError.throwJsonError({message:"Investor not authorized to view advice detail", errorCode: 1112});
		}
	})
	.then(advice => {
		if (options.fields.indexOf('portfolio') != -1 && advice.portfolio) {
			return PortfolioHelper.computeUpdatedPortfolioForPrice(advice.portfolio.toObject())
			.then(([updated, updatedPortfolio]) => {
				if(updated) {
					advice.portfolio = updatedPortfolio;
				}

				return advice;
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

module.exports.getAdvicePortfolio = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	const date = args.date.value;

	return AdviceHelper.isUserAuthorizedToViewAdviceDetail(userId, adviceId)
	.then(allowed => {

		if(allowed) {
			//Re-run the query after checking 
			return AdviceModel.fetchAdvicePortfolio({_id:adviceId}, date);
		} else {
			APIError.throwJsonError({message:"Investor not authorized to view advice detail", errorCode: 1112});
		}
	})
	.then(portfolioDetail => {
		if (portfolioDetail) {
			return PortfolioHelper.computeUpdatedPortfolioForPrice({detail: portfolioDetail}, date);
		} else {
			APIError.throwJsonError({message: "No portfolio found for advice"});
		}
	})
	.then(([updated, updatedPortfolio]) => {
		return res.status(200).send(updatedPortfolio);
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

  	Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: false}, {field:'advisor'})])
  	.then(([advisor, advice]) => {
  		if(advisor && advice) {			
    		const advisorId = advisor._id;

    		if(!advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor is not authorized to publish the advice", errorCode: 1102});
    		}

    		return AdviceModel.updateAdvice({_id: adviceId}, {public: true, publishDate: new Date()}, {new: true, fields:'_id public'});
						
		} else {
			if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found", errorCode: 1101});
			} else if(!advisor) {
				APIError.throwJsonError({userId:userId, message: "Advisor not found", errorCode: 1201});
			}
		}
	})
	.then(advice => {
		if (advice) {
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
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true, $or:[{prohibited: {$exists: false}}, {prohibited: false}]}, {field:'advisor'})])
  	.then(([advisor, investor, advice]) => {
  		if(advisor && investor && advice) {			
    		const investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't follow personal advice", errorCode: 1104});
    		}

    		return Promise.all([AdviceModel.updateFollowers({
    						_id: adviceId}, investorId),

						InvestorModel.updateFollowing({
			    			_id: investorId}, adviceId, "advice"
						    		)]);
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
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({userId: userId, adviceId: adviceId, count: advice.followers.filter(item => {return item.active==true}).length}); 
		} else if(!investor) {
			APIError.throwJsonError({userId:userId, message: "Investor not found", errorCode: 1301});
		} else if(!advice) {
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

  	return Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
  			InvestorModel.fetchInvestor({user: userId}, {fields: '_id', insert:true}), 
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true, $or:[{prohibited: {$exists: false}}, {prohibited: false}]}, {})])
  	.then(([advisor, investor, advice]) => {
  		if(investor && advice) {
  				
    		const investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't subscribe to personal advice", errorCode: 1105});
    		}

    		return Promise.all([AdviceModel.updateSubscribers({
    						_id: adviceId}, investorId),

						InvestorModel.updateSubscription({
			    			_id: investorId}, adviceId
						    		)]);
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
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({userId: userId, adviceId: adviceId, count: advice.subscribers.filter(item => {return item.active==true}).length}); 
		} else if(!investor) {
			APIError.throwJsonError({userId:userId, message: "Investor not found", errorCode: 1301});
		} else if(!advice) {
			APIError.throwJsonError({adviceId: adviceId, message: "Advice not found", errorCode: 1101});
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

	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {fields:'_id'})
	.then(users => {
		if(users) {
			if(users.map(item => item._id.toString()).indexOf(userId.toString()) !=-1) {
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

module.exports.requestApproveAdvice = function(args, res, next) {
	const userId = args.user._id;
	const adviceId = args.adviceId.value;
	return Promise.all([
		AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
		AdviceModel.fetchAdvice({_id: adviceId}, {fields:'advisor'})
	])
	.then(([advisor, advice]) => {
		var isOwner = advisor && advice ? advisor._id.equals(advice.advisor) : false;
		if(isOwner) {
			return AdviceModel.updateAdvice({_id:adviceId}, {approvalStatus: "pending"}, {new: true, fields:'approvalStatus'});
		} else {
			APIError.throwJsonError({message: "Advisor not authorized", errorCode:1116});
		}
	})
	.then(advice => {
		if (advice) {
			return res.status(200).send(advice);
		} else {
			APIError.throwJsonError({message: "Internal error updating approval status", errorCode: 1117});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

