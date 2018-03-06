/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-06 18:55:43
*/

'use strict';
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
			APIError.throwJsonError({message:"Advisor doesn't exist", errorCode: 5});
		}
	})
	.then(advices => {
		if(advices.length < config.get('max_advices_per_advisor')) {
			return HelperFunctions.validateAdvice(advice);
		} else {
			APIError.throwJsonError({advisorId: advisorId, message:"Cannot add more advices", errorCode: 5});
		}
	})
	.then(valid => {
		if(valid) {
			return PortfolioModel.savePortfolio(advice.portfolio);
		} else {
			APIError.throwJsonError({message: "Invalid Portfolio Composition"});
		}
	})
	.then(port => {
		if(port) {

			const adv = {
				name: advice.name,
				heading: advice.heading,
				description: advice.description,
				maxNotional:parseFloat(advice.maxNotional),
				rebalance: advice.rebalance,
				advisor: advisorId,
		       	portfolio: port._id,
		       	createdDate: new Date(),
		       	updatedDate: new Date(),
		    };
		    return AdviceModel.saveAdvice(adv);
	    } else {
	    	APIError.throwJsonError({userId: userId, message:"Invalid Portfolio: Create Advice"});
	    }
	})
    .then(advice => {
    	if(advice) {
    		return res.status(200).json(advice);
    	} else {
    		APIError.throwJsonError({message: "Advice not added to advisor"});	
    	}
    })
	.catch(err => {
		return res.status(400).send(err.message);
    });
};

module.exports.updateAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	const newAdvice = args.body.value;
	
	var adviceFields = 'advisor public portfolio name heading description';

	return Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
					AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: adviceFields})])
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
							APIError.throwJsonError({message: key + ": Not Authorized to modify"}); 
						}
					} 
				});

				return Promise.all([advice,
					  advice.public == true ? HelperFunctions.validateAdvice(newAdvice, advice) : HelperFunctions.validateAdvice(newAdvice)]);
			} else {
				APIError.throwJsonError({message: "Not Authorized"});
			}
		} else {
			APIError.throwJsonError({userId:userId, adviceId:adviceId, message: "Advice not found"});
		}
	})
	.then(([advice, validAdvice]) => {
		
		var adviceUpdates = Object.assign({}, newAdvice);
		delete adviceUpdates.portfolio;
		
		if (validAdvice) {
			return Promise.all([PortfolioModel.updatePortfolio({_id:advice.portfolio}, newAdvice.portfolio, {}, advice.public == true), 
				AdviceModel.updateAdvice({_id: adviceId}, adviceUpdates)]);
		} else {
			APIError.throwJsonError({message:"Invalid Advice"});
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
	if (["return", "volatility", "sharpe", "maxloss"].indexOf(orderParam) != -1) {
		orderParam = "latestPerformance."+orderParam;
	} else if(["rating", "numFollowers", "numSubscribers"].indexOf(orderParam) !=-1) {
		orderParam = "latestAnalytics."+orderParam;
	}

	options.orderParam = orderParam;

    options.fields = 'name description heading createdDate updatedDate advisor public approved maxNotional rebalance latestPerformance latestAnalytics';

    var query = {deleted: false};

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
        query.approved = {$in: approvedCategories};
    }

    const maxNotional = args.maxNotional.value;
    if(approved) {
        var maxNotionalCategories = maxNotional.split(",");    
        query.maxNotional = {$in: maxNotionalCategories.map(item => parseFloat(item))};
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
	    		advisorQuery.push({advisor:{'$ne': userAdvisorId}, public: true});
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
    			return AdviceHelper.computeAdviceSubscriptionDetail(advice._id, userAdvisorId, userInvestorId)
    			.then(subscriptionDetail => {
    				return Object.assign(subscriptionDetail, advice.toObject());
    			});
			});
		} else {
			APIError.throwJsonError({message: "No advices found"});
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
	options.fields = 'name heading description createdDate updatedDate advisor public approved portfolio rebalance maxNotional latestPerformance latestAnalytics';
	options.populate = 'advisor benchmark';
	
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, options),
		InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true})
	])
 	.then(([advisor, advice, investor]) => {
 		if(advice && advisor && investor) {
 			const advisorId = advisor._id;
 			const investorId = investor._id;
	 		if((!advisorId.equals(advice.advisor._id) && advice.public == true)  
	 			|| advisorId.equals(advice.advisor._id)) { 
	 			
				return AdviceHelper.computeAdviceSubscriptionDetail(adviceId, advisorId, investorId)
				.then(subscriptionDetail => {
					var nAdvice = Object.assign(subscriptionDetail, advice.toObject());
					return res.status(200).send(nAdvice);
				});

			} else {
				APIError.throwJsonError({userId: userId, adviceId: adviceId, message:"Not authorized to view this advice"});
			}
		} else {
			APIError.throwJsonError({message:'No advice found'});
		}
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
			APIError.throwJsonError({message:"Not authorized to view advice detail"});
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
			APIError.throwJsonError({message:"Not authorized to view advice detail"});
		}
	})
	.then(portfolioDetail => {
		if (portfolioDetail) {
			return PortfolioHelper.computeUpdatedPortfolioForPrice({detail: portfolioDetail}, date);
		} else {
			return [false, {portfolio: null}];
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
	
	AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'})
	.then(advisor => {
		if(advisor) {
			//return //Promise.all([AdvisorModel.removeAdvice({_id: advisorId}, adviceId),
			 return AdviceModel.deleteAdvice({_id: adviceId, advisor: advisor._id});//]);
		} else {
			APIError.throwJsonError({userId: userId, message:"Not authorized"}); 
		}
	})
	.then(advice => {
		if(advice) {
			return res.status(200).send({adviceId:adviceId, message:"Advice deleted"});
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
    			APIError.throwJsonError({message: "Advisor can't publish his advice"});
    		}

    		return AdviceModel.updateAdvice({_id: adviceId}, {public: true, publishDate: new Date()});
						
		} else {
			if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found or already public"});
			} else if(!advisor) {
				APIError.throwJsonError({userId:userId, message: "Advisor not found"});
			}
		}
	})
	.then(advice => {
		if (advice) {
			return res.status(200).json({adviceId: adviceId, message: "Successfully published"}); 
		} else {
			APIError.throwJsonError({adviceId: adviceId, message: "Error publishing advice"});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.followAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
  		InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true}), 
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true}, {field:'advisor'})])
  	.then(([advisor, investor, advice]) => {
  		if(advisor && investor && advice) {			
    		const investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't follow his advice"});
    		}

    		return Promise.all([AdviceModel.updateFollowers({
    						_id: adviceId}, investorId),

						InvestorModel.updateFollowing({
			    			_id: investorId}, adviceId, "advice"
						    		)]);
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found"});
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found"});
			} else if(!advisor) {
				APIError.throwJsonError({userId:userId, message: "Advisor not found"});
			}
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({userId: userId, adviceId: adviceId, count: advice.followers.filter(item => {return item.active==true}).length}); 
		} else if(!investor) {
			APIError.throwJsonError({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			APIError.throwJsonError({adviceId: adviceId, message: "No Advice found"});
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
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true}, {})])
  	.then(([advisor, investor, advice]) => {
  		if(investor && advice) {
  				
    		const investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't subscribe his advice"});
    		}

    		return Promise.all([AdviceModel.updateSubscribers({
    						_id: adviceId}, investorId),

						InvestorModel.updateSubscription({
			    			_id: investorId}, adviceId
						    		)]);
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found"});	
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found"});	
			} else if(!advisor) {
				APIError.throwJsonError({userId:userId, message: "Advisor not found"});
			}
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({userId: userId, adviceId: adviceId, count: advice.subscribers.filter(item => {return item.active==true}).length}); 
		} else if(!investor) {
			APIError.throwJsonError({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			APIError.throwJsonError({adviceId: adviceId, message: "No Advice found"});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};
