/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-28 18:05:27
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const Promise = require('bluebird');
const config = require('config');
const HelperFunctions = require("../helpers");
const APIError = require('../../utils/error');

module.exports.createAdvice = function(args, res, next) {
	const userId = args.user._id;
	const advice = args.body.value;

	var advisorId='';
	
	//Any one can create an advice
	AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true})
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
    		//return res.status(200).json(advice);
			/*return Promise.all([advice, AdvisorModel.addAdvice({
        		_id: advisorId
			}, advice._id)]);
		} else {
			APIError.throwJsonError({message: "Advice not created"});
			//return res.status(400).json({message: "Invalid Portfolio"});
		}		
    })
    .then(([advice, advisor]) => {
    	if(advice && advisor) {*/
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
					if(allowedKeys.indexOf(key) == -1 && newAdvice[key] != advice[key]) {
						APIError.throwJsonError({message: key + ": Not Authorized to modify"}); 
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
		
		var adviceUpdates = JSON.parse(JSON.stringify(newAdvice));
		delete adviceUpdates.portfolio;
		
		if (validAdvice) {
			return Promise.all([PortfolioModel.updatePortfolio({_id:advice.portfolio._id}, newAdvice.portfolio, advice.public == true), 
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

    options.sort = args.sort.value;
    options.fields = 'name description heading createdDate updatedDate advisor public approved maxNotional rebalance analytics subscribers followers';

    const following = args.following.value;

    const subscribed = args.subscribed.value;
    const personal = args.personal.value;

    const approved = args.approved.value;

    const defaultQuery = {deleted: false, public: true};

    if(approved) {
    	defaultQuery.approved = true;
    }

    const queryArray = [defaultQuery];
   	
   	let investorId;
   	let advisorId;

    Promise.all([AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true}),
    		InvestorModel.fetchInvestor({user:userId}, {fields: '_id', insert: true})])
    .then(([advisor, investor]) => {
    	
    	advisorId = advisor._id;
    	investorId = investor._id;
    	
    	if (personal) {
        	queryArray.push({advisor: advisorId, deleted: false});
	    } 

	    if (following) {
	        queryArray.push(Object.assign({}, defaultQuery, {followers: {'$elemMatch':{'$eq': investorId}}}));
	    } 

	    if(subscribed){
	        queryArray.push(Object.assign({}, defaultQuery, {subscribers: {'$elemMatch':{'$eq': investorId}}}));
	    }

	    const query = queryArray.length > 0 ? {'$or': queryArray} : defaultQuery;

    	return AdviceModel.fetchAdvices(query, options)
	})
    .then(advices => {
    	if(advices) {
	    	var nAdvices = advices.map(advice => {
	    		var nAdvice = Object.assign({}, advice.toObject());

	    		var isFollowing = false;
	 			var isSubscribed = false;
	 			var isOwner = advisorId.equals(advice.advisor._id);

	 			if(!advisorId.equals(advice.advisor._id)) {
	 				isFollowing = advice.followers.filter(item => {return item.active == true}).map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
	 				isSubscribed = advice.subscribers.filter(item => {return item.active == true}).map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
	 			} 

	 			var adviceAnalytics = advice.analytics;
	 			var numAdviceAnalytics = adviceAnalytics.length;

	 			var latestAnalytics = numAdviceAnalytics > 0 ? adviceAnalytics[numAdviceAnalytics - 1] : null;

	 			delete nAdvice.subscribers;
	 			delete nAdvice.followers;
	 			delete nAdvice.analytics;

	 			nAdvice = Object.assign({latestAnalytics: latestAnalytics, isFollowing: isFollowing, isSubscribed: isSubscribed, isOwner: isOwner}, nAdvice);
	 			return nAdvice;
	    	});

    		return res.status(200).json(nAdvices);
		} else {
			APIError.throwJsonError({message: "No advices found"});
		}
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.getAdviceSummary = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	
	const options = {};
	options.fields = 'name heading description createdDate updatedDate advisor public approved analytics followers subscribers portfolio rebalance maxNotional';
	options.populate = 'advisor';
	
	Promise.all([
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
	 			
	 			var isFollowing = false;
	 			var isSubscribed = false;
	 			var isOwner = advisorId.equals(advice.advisor._id);

	 			if(!advisorId.equals(advice.advisor._id)) {
	 				isFollowing = advice.followers.filter(item => {return item.active == true}).map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
	 				isSubscribed = advice.subscribers.filter(item => {return item.active == true}).map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
	 			} 
 				
 				var adviceAnalytics = advice.analytics;
	 			var numAdviceAnalytics = adviceAnalytics.length;
 				var latestAnalytics = numAdviceAnalytics > 0 ? adviceAnalytics[numAdviceAnalytics - 1] : null;

 				var nAdvice = advice.toObject();

 				delete nAdvice.subscribers;
 				delete nAdvice.followers;
 				delete nAdvice.analytics;

 				nAdvice = Object.assign({latestAnalytics: latestAnalytics, isFollowing: isFollowing, isSubscribed: isSubscribed, isOwner: isOwner}, nAdvice);
 				return res.status(200).send(nAdvice);	

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

	return Promise.all([InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert: true}),
				AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert: true}),
				AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor followers subscribers'})])
	.then(([investor, advisor, advice])  => {
		if(investor && advisor && advice) {
			const advisorId = advisor._id;
			
			var activeSubscribers = advice.subscribers.filter(item => {return item.active == true}).map(item => item.investor.toString());
			var activeFollowers = advice.followers.filter(item => {return item.active == true}).map(item => item.investor.toString());
			
			const investorId = investor._id.toString();
			//PERSONAL or subscribers
			//get to see expanded portfolio if chosen
			if (advice.advisor.equals(advisorId) || activeSubscribers.indexOf(investorId) != -1) {
				
				if (options.fields.indexOf('portfolio') != -1) {
					options.populate = options.populate.concat(' portfolio');
				}
			}

			//Re-run the query after checking 
			return AdviceModel.fetchAdvice({_id:adviceId}, options);
		
		} else {
			if(!investor) {
				APIError.throwJsonError({message:"Investor not found"});
			} else if(!advisor) {
				APIError.throwJsonError({message:"Advisor not found"});
			} else if (!advice) {
				APIError.throwJsonError({message:"Advice not found"});
			}
		}
	})
	.then(advice => {
		if (options.fields.indexOf('portfolio') != -1 && advice.portfolio) {
			return HelperFunctions.computeUpdatedPortfolioForLatestPrice(advice.portfolio.toObject())
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
	/*.then(advice => {
		if (advice.subscribers || advice.followers) {
			advice = JSON.parse(JSON.stringify(advice));
		}

		if (advice.subscribers) {
			var ct = advice.subscribers.filter(item => {return item.active == true}).length;
			delete advice.subscribers;
			advice["subscribers"]  = ct;
		}

		if (advice.followers) {
			var ct = advice.followers.filter(item => {return item.active == true}).length;
			delete advice.followers;
			advice["followers"] = ct;
		}

		return advice;
	})*/
	.then(finalAdvice => {
		return res.status(200).json(finalAdvice);
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
