/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-09 13:23:35
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

function _userAuthorizedPrivateInvestorGroup(privateInvestorGroup, investorId) {
	return privateInvestorGroup && privateInvestorGroup.investors ? 
		privateInvestorGroup.investors.map(item => item.toString()).indexOf(investorId.toString()) !=-1 : false;
}

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
		       	updatedDate: new Date()
		    };

		    //Update the advice for private group
		    if(advice.groupName && advice.groupName != "") {
		    	adv.privateInvestorGroup = {groupName: advice.groupName, investors: []};
		    	adv.semiPublic = true;
		    }

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
	
	var adviceFields = 'advisor publishDetails portfolio name heading description';

	return Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
					AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: adviceFields})])
	.then(([advisor, advice]) => {

		if(advisor && advice) {
			if(advice.advisor.equals(advisor._id)) {

				let allowedKeys;
				if (advice.publishDetails.status == false) {
					allowedKeys = ['name', 'heading', 'description', 'portfolio', 'maxNotional', 'rebalance']; 
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
					  advice.publishDetails.status == true ? HelperFunctions.validateAdvice(newAdvice, advice) : HelperFunctions.validateAdvice(newAdvice)]);
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
			return Promise.all([PortfolioModel.updatePortfolio({_id:advice.portfolio}, newAdvice.portfolio, {}, advice.publishDetails.status == true), 
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

    /*const groups = args.groups.value;
    if(groups) {
    	var groupCategories = groups.split(",");

    }*/

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
	    				
	    		//[(advisor != self && (public == true || investor in closedgroup) || -- ALL
				//(advisor != self) - q1
				var q1 = {advisor:{'$ne': userAdvisorId}};
				
				//(publishedStatus == true) && (category == public || (category == closed && investor in closedgroup)) - q2
    			
    			var q21 = {'publishDetails.status':true};
    			var q221 = {'publishDetails.category':'public'};
    			var q222 = {'$and': [{'publishDetails.category':'closed'}, {'privateInvestorGroup.investors':userInvestorId}]};
    			var q22 = {'$or': [q221,q222]};
    			var q2 = {'$and': [q21,q22]};
    			
	    		advisorQuery.push({'$and': [q1,q2]});
	    	}

	    	query = {'$and': [query, {'$or': advisorQuery}]}

	    }

     	if(advisorId) {
	    	query.advisor = advisorId;
	    	if (!userAdvisorId.equals(advisorId)) {

	    		var q21 = {'publishDetails.status':true};
    			var q221 = {'publishDetails.category':'public'};
    			var q222 = {'$and': [{'publishDetails.category':'closed'}, {'privateInvestorGroup.investors':userInvestorId}]};
    			var q22 = {'$or': [q221,q222]};
    			var q2 = {'$and': [q21, q22]};

	    		query = {'$and':[query, q2]};	
	    	}
	    }

	    //  (deleted == false && subscribed == true) && 
	    //	[(advisor != self && (public == true || investor in closedgruop) || -- ALL
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
	options.fields = 'name heading description createdDate updatedDate advisor approved portfolio rebalance maxNotional latestPerformance latestAnalytics';
	options.populate = 'advisor benchmark';
	
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields:'advisor'}),
		InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true})
	])
 	.then(([advisor, advice, investor]) => {
 		if(advice && advisor && investor) {
 			const userAdvisorId = advisor._id;
 			const userInvestorId = investor._id;

 			var query = {_id:adviceId, deleted: false};
 			if (!userAdvisorId.equals(advice.advisor)) {
	    		var q21 = {'publishDetails.status':true};
    			var q221 = {'publishDetails.category':'public'};
    			var q222 = {'$and': [{'publishDetails.category':'closed'}, {'privateInvestorGroup.investors':userInvestorId}]};
    			var q22 = {'$or': [q221,q222]};
    			var q2 = {'$and': [q21, q22]};

	    		query = {'$and':[query, q2]};	
	    	} 
 			
 			return Promise.all([
 				AdviceModel.fetchAdvice(query, options),
 				AdviceHelper.computeAdviceSubscriptionDetail(adviceId, userAdvisorId, userInvestorId)
 			]);

		} else {
			APIError.throwJsonError({message:'No advice found'});
		}
 	})
 	.then(([advice, subscriptionDetail]) => {
 		if(advice) {
 			const nAdvice = Object.assign(subscriptionDetail, advice.toObject());
 			return res.status(200).send(nAdvice);
 		} else {
 			APIError.throwJsonError({message: "No advice found or unauthorized"});
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
	
	return AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'})
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
  	const publishCategory = args.body.value.category;

  	Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, 'publishDetails.status': false}, {field:'advisor'})])
  	.then(([advisor, advice]) => {
  		if(advisor && advice) {			
    		const advisorId = advisor._id;

    		if(!advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't publish his advice"});
    		}

    		return AdviceModel.updateAdvice({_id: adviceId}, {publishDetails: {status: true, date: new Date(), category: publishCategory}});
						
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
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, 'publishDetails.status': true}, {field:'advisor privateInvestorGroup publishDetails'})])
  	.then(([advisor, investor, advice]) => {
  		if(advisor && investor && advice) {			
    		const investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't follow his advice"});
    		}

    		if (advice.publishDetails.category == 'closed' && !_userAuthorizedPrivateInvestorGroup(advice.privateInvestorGroup, investorId)) {
    			APIError.throwJsonError({message: "Investor not authorized to follow a closed advice"});
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
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false, 'publishDetails.status': true}, {fields: 'privateInvestorGroup publishDetails'})
	])
  	.then(([advisor, investor, advice]) => {
  		if(investor && advice) {
  				
    		const investorId = investor._id; 
    		const advisorId = advisor._id;

    		if(advice.advisor.equals(advisorId)) {
    			APIError.throwJsonError({message: "Advisor can't subscribe his advice"});
    		}

    		if (advice.publishDetails.category == 'closed' && !_userAuthorizedPrivateInvestorGroup(advice.privateInvestorGroup, investorId)) {
    			APIError.throwJsonError({message: "Investor not authorized to subscribe a closed advice"});
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
				APIError.throwJsonError({message: "User not authorized to approve"});
			}
		} else {
			APIError.throwJsonError({message: " No authorized user found to approve"});
		}
	})
	.then(advice => {
		return res.status(200).send({message: "Approval updated"});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* Handle advisors/advice originated operations for private investor group
*/
module.exports.postAdviceForInvestorGroup = function(args, res, next) {
	const userId = args.user._id;
	const adviceId = args.adviceId.value;
	const email = args.body.value.email;
	const investorId = args.body.value.investor;
	const operation = args.body.value.operation;

	return new Promise((resolve, reject) => {
		if (email && email!="" ) {
			return UserModel.fetchUser({email: email}, {fields: '_id active'})
			.then(user => {
				resolve(InvestorModel.fetchInvestor({user: user._id}, {fields: '_id'}));
			})
		} else if(investorId && investorId!="") {
			resolve(InvestorModel.fetchInvestor({_id: investorId}, {fields: '_id'}));
		} else {
			APIError.throwJsonError({message: "No investor or email provided"});
		}
	})
	.then(investor => {
		if(investor) {
			return Promise.all([
				AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'advisor'}),
				AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
				investor
			]);	
		} else {
			APIError.throwJsonError({message: "No Investor Found"});
		}
	})
	.then(([advice, advisor, investor]) => {
		if(advice && advisor && investor) {
			if(advice.advisor.equals(advisor._id)) {
				if (operation == "accept") {
					return AdviceModel.acceptInvestorToGroup({_id: adviceId}, investor._id)
				} else if(operation == "reject") {
					return AdviceModel.rejectInvestorFromGroup({_id: adviceId}, investor._id);
				} else if(operation == "invite") {
					return InvestorModel.addAdviceInvite({_id: investor}, advice._id);
				} else {
					APIError.throwJsonError({message: "Illegal operation"});
				}
			} else {
				APIError.throwJsonError({message: "Not authorized"});
			}
		} else {
			if (!advice) {
				APIError.throwJsonError({advice: adviceId, message:"No advice found"});
			} else if(!advisor) {
				APIError.throwJsonError({user: userIdId, message:"No advisor found"});
			} else if (!user) {
				APIError.throwJsonError({email: email, message:"No user found"});
			}
		}
	})
	.then(advice => {
		return res.status(200).send({message: "Operation executed successfully"});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};
