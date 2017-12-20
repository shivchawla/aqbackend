/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-12-20 17:37:58
*/

'use strict';
const AdvisorModel = require('../models/Marketplace/Advisor');
const InvestorModel = require('../models/Marketplace/Investor');
const AdviceModel = require('../models/Marketplace/Advice');
const UserModel = require('../models/user');
const PortfolioModel = require('../models/Marketplace/Portfolio');
const Promise = require('bluebird');
const config = require('config');
const HelperFunctions = require("./helpers");
const APIError = require('../utils/error');

function getDate(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getYear();

    return d+"-"+m+"-"+y;  
}

module.exports.createAdvice = function(args, res, next) {
	const userId = args.user._id;
	const advice = args.body.value;

	var advisorId='';
	//Any one can create an advice
	AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'})
	.then(advisor => {
		if(!advisor) {
			return AdvisorModel.createAdvisor({user:userId})
		} else {
			return advisor;
		}
	})
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
				description: advice.description,
				advisor: advisorId,
				benchmark: advice.benchmark, 
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

module.exports.updateAdvicePortfolio = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	const newPortfolio = args.body.value;

	return Promise.all([AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
					AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields:'advisor portfolio benchmark'})])
	.then(([advisor, advice]) => {
		if(advisor && advice) {
			if(advice.advisor.equals(advisor._id)) {
				var newAdvice = {portfolio: newPortfolio, benchmark: advice.benchmark}
				return HelperFunctions.validateAdvice(newAdvice, advice);
			} else {
				APIError.throwJsonError({message: "Not Authorized"});
			}
		} else {
			APIError.throwJsonError({userId:userId, adviceId:adviceId, message: "Advice not found"});
		}
	})
	.then(valid => {
		if(valid){
			return PortfolioModel.savePortfolio(newPortfolio);
		} else {
			APIError.throwJsonError({message: "Invalid Portfolio Composition or dates"});
		}	
	})
	.then(portfolio => {
		if(portfolio) {
			return AdviceModel.updateAdvice({_id: adviceId}, {portfolio: portfolio._id});
		} else {
			APIError.throwJsonError({message:"Can't create new Portfolio"});
		}
	})
	.then(advice => {
		return res.status(200).json(advice);
	})
    .catch(err => {
    	return res.status(400).json(err.message);
    });
};

module.exports.updateAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	var updates = args.body.value;
	
	return Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'}),
					AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields:'advisor'})])
	.then(([advisor, advice]) => {
		if(advisor && advice) {
			if(advice.advisor.equals(advisor._id)) {
				
				var allowedKeys = ['public']; 
				Object.keys(updates).forEach(key => {
					if(allowedKeys.indexOf(key) == -1) {
						APIError.throwJsonError({message: "Not Authorized to modify"}); 
					} 
				});

				if(Object.keys(updates).length != 0) {
					return AdviceModel.updateAdvice({_id: adviceId}, updates);
				} else {
					APIError.throwJsonError({message: "Nothing to update"}); 
				}	

			} else {
				APIError.throwJsonError({message: "Not Authorized"});
			}
		} else {
			APIError.throwJsonError({userId:userId, adviceId:adviceId, message: "Advice not found"});
		}
	})
	.then(advice => {
		return res.status(200).send({message: "Advice updated successfully"});
	})
	.catch(err => {
		return res.status(400).json(err.message);	
	})
};

module.exports.getAdvices = function(args, res, next) {
	const userId = args.user._id;
    
    const options = {};
	options.skip = args.skip.value;
    options.limit = args.limit.value;

    options.sort = args.sort.value;
    options.fields = 'name description performance createdDate updatedDate advisor public approved';

    const following = args.following.value;
    const subscribed = args.subscribed.value;
    const personal = args.personal.value;
    const approved = args.approved.value;

    const query = {deleted: false, public: true};

    
    if(approved) {
    	query.approved = approved;
    }
    
    Promise.all([AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
    		InvestorModel.fetchInvestor({user:userId}, {fields: '_id'})])
    .then(([advisor,investor]) => {
    	if (personal) {
	        query.advisor = advisor._id;
	        delete query.public;
	    } else if (following) {
	        query.followers = {'$elemMatch':{'$eq': investor._id}}
	    } else if(subscribed){
	        query.subscribers = {'$elemMatch':{'$eq': investor._id}}
	    }
    
    	return AdviceModel.fetchAdvices(query, options)
	})
    .then(advices => {
    	if(advices) {
    		return res.status(200).json(advices);
		} else {
			APIError.throwJsonError({message: "No advices found"});
		}

    	/*return Promise.all(advices.map(advice => {
				HelperFunctions.getUpdatedAdviceSummary(advice._id)};
			})
		);*/
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.getAdviceSummary = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;
	
	const options = {};
	options.fields = 'name description benchmark advicePerformance createdDate updatedDate advisor public approved';
	
	Promise.all([AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'}),
				AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, options)])
 	.then(([advisor, advice]) => {
 		if(advice && advisor) {
 			const advisorId = advisor._id;
	 		if((!advisorId.equals(advice.advisor) && advice.public == true && advice.approved == true)  
	 			|| advisorId.equals(advice.advisor)) { 
	 			
	 			var performanceUpdateRequired = options.fields.indexOf('advicePerformance') != -1 ?
							 _checkIfPerformanceUpdateRequired(advice) : false;

		        return performanceUpdateRequired ? _updateAdviceWithPerformance(adviceId) : null;
	 			
			} else {
				APIError.throwJsonError({userId: userId, adviceId: adviceId, message:"Not authorized to view this advice"});
			}
		} else {
			APIError.throwJsonError({message:'No advice found'});
		}
 	})
	.then(updated => {
		return AdviceModel.fetchAdvice({_id:adviceId}, options);
	})
	.then(finalAdvice => {
		return res.status(200).json(finalAdvice);
	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });    
};

module.exports.getAdviceDetail = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
   	options.fields = args.fields ? args.fields.value : [];

	return Promise.all([InvestorModel.fetchInvestor({user: userId}, {fields:'_id'}),
				AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id'}),
				AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor followers subscribers'})])
	.then(([investor, advisor, advice])  => {
		if(investor && advisor && advice) {
			const advisorId = advisor._id;
			const investorId = investor._id;

			//PERSONAL
			if (advice.advisor.equals(advisorId) || advice.subscribers.indexOf(investorId) != -1) {
				if(!options.fields) {
					options.fields = 'portfolio advicePerformance subscribers followers createdDate updatedDate approved advisor';
				}
			} else if(advice.followers.indexOf(investorId) != -1) {
				//if(!options.fields) {
					// Over ride fields as portfolio (and a few others) are NOT allowed
					options.fields = 'advicePerformance subscribers followers createdDate updatedDate advisor';
				//} 
			}

			var performanceUpdateRequired = options.fields.indexOf('advicePerformance') != -1 ?
							 _checkIfPerformanceUpdateRequired(advice) : false;

         	return performanceUpdateRequired ? _updateAdviceWithPerformance(adviceId, options.fields) : null;

		} else {
			if(!investor) {
				APIError.throwJsonError({message:"Investor not found"});
			} else if(!advisor) {
				APIError.throwJsonError({message:"Advisor not found"});
			} else if (!advice) {
				APIError.throwJsonError({message:"Advice not found or already deleted"});
			}
		}
	})
	.then(updated => {
		return AdviceModel.fetchAdvice({_id:adviceId}, options);
	})
	.then(finalAdvice => {
		return res.status(200).json(finalAdvice);
	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });
};

/*module.exports.getAdviceHistory = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    options.fields = args.fields.value;

    if (!options.fields) {
    	options.fields = 'advisor portfolioHistory performanceHistory ratingHistory';
    }
    
    //Only the investor and author can see the advice history
    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user){
    		if(user.isInvestor || (user.isAdvisor && user.advisor == advisorId)){
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'});
			} else {
				return res.status(400).json({message:"Not authorized"});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output.advices) {
			var ids = output.advices;
			if(ids.indexOf(adviceId) != -1) {
				return AdviceModel.getAdvice({_id:adviceId}, options)
			} 
		} else { 
			return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});
		}
	})
	.then(adviceHistory => {
		if(adviceHistory) {
			return res.status(200).json(adviceHistory);
		} else {
			return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});
		}
	})
  	.catch(err => {
    	return res.status(400).send(err.message);
    });
};*/

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

module.exports.followAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	Promise.all([InvestorModel.fetchInvestor({user: userId}, {fields:'_id'}), 
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true}, {})])
  	.then(([investor, advice]) => {
  		if(investor && advice) {			
    		const investorId = investor._id; 
    		
    		return Promise.all([AdviceModel.updateFollowers({
    						_id: adviceId}, userId),

						InvestorModel.updateFollowing({
			    			_id: investorId}, adviceId, "advice"
						    		)]);
			
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found"});
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found"});
			}
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({followers:advice.followers, count: advice.followers.length}); 
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

  	return Promise.all([InvestorModel.fetchInvestor({user: userId}, {fields: '_id'}), 
  			AdviceModel.fetchAdvice({_id: adviceId, deleted: false, public: true}, {})])
  	.then(([investor, advice]) => {
  		if(investor && advice) {
  				
    		const investorId = investor._id; 
    		
    		return Promise.all([AdviceModel.updateSubscribers({
    						_id: adviceId}, userId),

						InvestorModel.updateSubscription({
			    			_id: investorId}, adviceId
						    		)]);
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found"});	
			} else if (!advice) {
				APIError.throwJsonError({adviceId: adviceId, message: "Advice not found"});	
			}
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({userId: userId, adviceId: adviceId, message: "Subscribed updated successfully"}); 
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

function _updateAdviceWithPerformance(adviceId) {
	return HelperFunctions.calculatePerformance(adviceId)
	.then(performance => {
		if(performance) {
			performance["updatedDate"] = new Date();
			performance.portfolioStats = performance.portfolioStats.map(item => { 
				  item.date = new Date(item.date); 
				  return item;
			});	
			
			performance["updateMessage"] = "Updated successfully";
			return AdviceModel.updateAdvice({_id: adviceId}, {advicePerformance: performance});
		
		} else {
			return AdviceModel.updateAdvice({_id: adviceId}, {"advicePerformance.updateMessage": "Performance could not be calculated", "advicePerformance.updatedDate": new Date()});
		}
	})
}

function _checkIfPerformanceUpdateRequired(advice, fields) {
	
	var update = false;
    //check if advice Performance is the latest
    if(advice.advicePerformance) {
        var performance = advice.advicePerformance;

        if(performance.updatedDate) {
            if(getDate(performance.updatedDate) < getDate(new Date())) {
                update = true;
            }
        } else {
        	update = true; 
        } 

    } else {
        update = true;
    }

    return update;
}











