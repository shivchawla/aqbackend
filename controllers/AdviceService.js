/*
* @Author: Shiv Chawla
* @Date:   2017-03-03 15:00:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-04 23:23:25
*/

'use strict';
const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const AdviceModel = require('../models/advice');
const UserModel = require('../models/user');
const Promise = require('bluebird');
const config = require('config');

exports.createAdvice = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const userId = args.user._id;

	// Only author/advisor can create an advice
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if(user.isAdvisor && user.advisor == advisorId) {
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'})
			} else {
				return res.status(400).json({advisorId: advisorId, message:"Not Authorized", errorCode: 1});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(advisor => {
		if(advisor.advices) {
			var advices = advisor.advices;
			if(advices.length < config.get('max_advices_per_advisor')) {
				const advice = {
			        advisor: advisorId,
			       	startDate: args.body.value.startDate,
			       	endDate: args.body.value.endDate,
			       	createdDate: new Date(),
			       	updatedDate: new Date(),
			       	portfolio: args.body.value.portfolio
			    };
			
			    return AdviceModel.saveAdvice(advice);

			} else {
				return res.status(400).json({advisorId: advisorId, message:"Cannot add more advices", errorCode: 5});
			}
		}
	})
    .then(advice => {
    	if(advice) {
			return AdvisorModel.addAdvice({
        		_id: advisorId
			}, advice._id);
		}		
    })
    .then(advice => {
    	return res.status(200).json(advice);
    })
    .catch(err => {
    	next(err);
    });

};

exports.updateAdvice = function(args, res, next) {
	const adviceId = args.adviceId.value;
	const advisorId = args.advisorId.value;

	const user = args.user;

	const updates = args.body.value;
	updates.updatedDate = new Date();

	//Only author/advisor can update the advice
	UserModel.fetchUser({_id:user_id})
	.then(user => {
		if(user) {
			if(user.isAdvisor && user.advisor == advisorId ) {
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'})
			} else {
				return res.status(400).json({advisorId: advisorId, message:"Not Authorized", errorCode: 1});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output.advices) {
			var ids = output.advices;
			if(ids.indexOf(adviceId) != -1) {
				return AdviceModel.updateAdvice({_id: adviceId}, updates)
			}
		}

		return res.status(400).json({advisorId:advisorId, message:"No Advice found"});
	})
    .then(advice => {
    	if(advice) {	
    		return res.status(200).json(advice);
		}
    })
    .catch(err => {
    	next(err);
    });
};

exports.getAdvices = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const userId = args.user._id;
    
	const options = {};
    options.fields = args.fields.value;

    //Only the investor and author can see the advice history
    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user) {
    		if(user.isInvestor || (user.isAdvisor && user.advisor == advisorId)){
    			return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'});
			} else {
				return res.status(400).json({userId:userId, message:"Not Authorized"});
			}
		} else {
			return res.status(400).json({userId: userId, message:"User not found"}); 
		}
	})
	.then(output => {
		if(output) {
			var adviceIds = output.advices;
			const userId = args.user._id;
		  	return Promise.all([AdviceModel.getAdvices({_id: {$in: adviceIds}}, options),
		  						UserModel.fetchUser({_id: userId})]);
	  	} else {
		  	return res.status(400).json({advisorId:advisorId, message:"No Advice found"});
	  	}
  	})
  	.then(([advices, user]) => {
	  	
	  	if (user.isAdvisor) {
	  		return advices;
	  	} else {
	  		
	  		// Filter advices if user is not the advisor himself or if not subssribed
			// If user in an investor, he must first subscribe to the idea
	  		var advicesForInvestor = [];
	  		advices.forEach(advice => {
	            var subscribers = advice.subscribers.map(x => x.subscriber);
	            
	            //************
	            //TODO: create seprate set of options for subscribed and unsubscribed investor
	            //************
	            if (subscribers.indexOf(user.investor) != -1) {
	            	advicesForInvestor.push(advice);
	            } else {
	            	advicesForInvestor.push(advice);
	            }
        	});

	  		return advicesForInvestor;

	  	}

	  	return res.status(400).json({message:"No advices found"});

  	})
  	.then(advices => {
		return res.status(200).json(advices);
	})
  	.catch(err => {
    	next(err);
    });
};

exports.getAdvice = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    options.fields = args.fields.value;
    
    //Only the investor and author can see the advice history
    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user) {
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
			var adviceIds = output.advices;

			if(adviceIds.indexOf(adviceId) != -1) {
				// Create promise returning advices 
				return Promise.all([AdviceModel.getAdvice({_id: adviceId}, options),
		  						UserModel.fetchUser({_id: userId})]);
		  	} 
	  	}
		
		return res.status(400).json({advisorId: advisorId, adviceId: adviceId, message:"No Advice found"});
	
  	})
  	.then(([advice, user]) => {
	  	if(advice && user) {
		  	if (user.isAdvisor) {
		  		return advice;
		  	} else {
		  		
		  		// Filter advices if user is not the advisor himself or if not subssribed
				// If user in an investor, he must first subscribe to the idea
	  		    var subscribers = advice.subscribers.map(x => x.subscriber);
		            
	            //************
	            //TODO: create seprate set of options for subscribed and unsubscribed investor
	            //************
	            if (subscribers.indexOf(user.investor) != -1) {
	            	return advice;
	            } else {
	            	return advice;
	            }
		  	}
	  	}

	  	return res.status(400).json({advisorId:advisorId, adviceId: adviceId, message:"No Advice found"});

  	})
  	.then(advice => {
		return res.status(200).json(advice);
	})
  	.catch(err => {
    	next(err);
    });
	
};

exports.getAdviceHistory = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	const options = {};
    options.fields = args.fields.value;
    
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
				return AdviceModel.getAdvice({_id:adviceId}, "adviceHistory")
			} 
		} 

		return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});

	})
	.then(adviceHistoryIds => {
		if(adviceHistoryIds) {
			var advices = [];
			adviceHistoryIds.forEach(id => {

				//TODO: update optins is requested by an investor

				advices.push(AdviceModel.getAdvice({_id: id}, options));
			});

			return Promise.all(advices);
		}

		return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});
	})
	.then(adviceHistory => {
		if(adviceHistory) {
			return res.status(200).json(adviceHistory);
		} else {
			return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});
		}
	})
  	.catch(err => {
    	next(err);
    });
};

exports.deleteAdvice = function(args, res, next) {
	const advisorId = args.advisorId.value;
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if (user.isAdvisor && user.advisor == advisorId) {
				return AdvisorModel.getAdvisor({_id: advisorId}, {fields:'advices'})
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
				return AdvisorModel.removeAdvice({_id:advisorId}, adviceId);
			} 
		}

		return res.status(400).json({advisorId:advisorId, adviceId:adviceId, message:"No Advice found"});

	})
	.then(advisor => {
		if(advisor){
			return AdviceModel.deleteAdvice({_id: adviceId});
		} 
			
	})
	.then(advice => {
		if(advice){
			return res.status(200).json({advisorId:advisorId, adviceId:adviceId, message:"Deleted Successfully"});
		}
	})
  	.catch(err => {
    	next(err);
    });
};

exports.followAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	UserModel.fetchUser({_id: userId})
  	.then(user => {
  		if(user) {
  			if (user.isInvestor) {
	    		
	    		const investorId = user.investor; 
	    		
	    		return Promise.all([AdviceModel.updateFollowers({
	    						_id: adviceId}, investorId),

							InvestorModel.updateFollowing({
				    			_id: investorId}, adviceId, "advice"
							    		)]);
			} else {
				return res.status(400).json({userId: userId, message: "Not Authorized"});
			}
		} else {
			return res.status(400).json({userId: user._id, message: "User not found"});
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({followers:advice.followers, count: advice.followers.length}); 
		} else if(!investor) {
			return res.status(400).json({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			return res.status(400).json({adviceId: adviceId, message: "No Advice found"});
		}
	})
    .catch(err => {
        next(err);
    });
};

exports.subscribeAdvice = function(args, res, next) {
    const userId = args.user._id;
  	const adviceId = args.adviceId.value;

  	UserModel.fetchUser({_id: userId})
  	.then(user => {
  		if(user) {
  			if (user.isInvestor) {
	    		
	    		const investorId = user.investor; 
	    		
	    		return Promise.all([AdviceModel.updateSubscribers({
	    						_id: adviceId}, investorId),

							InvestorModel.updateSubscription({
				    			_id: investorId}, adviceId
							    		)]);
			} else {
				return res.status(400).json({userId: userId, message: "Not Authorized"});
			}
		} else {
			return res.status(400).json({userId: user._id, message: "User not found"});
		}
	})
	.then(([advice, investor]) => {
		if (advice && investor) {
			return res.status(200).json({investorId: investor._id, adviceId: advice._id, message: "Subscribed updated successfully"}); 
		} else if(!investor) {
			return res.status(400).json({userId:userId, message: "No Investor found"});
		} else if(!advice) {
			return res.status(400).json({adviceId: adviceId, message: "No Advice found"});
		}
	})
    .catch(err => {
        next(err);
    });
};


