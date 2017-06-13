/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 21:06:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-22 15:54:48
*/

'use strict';
const AdviceModel = require('../models/advice');
const InvestorModel = require('../models/investor');
const UserModel = require('../models/user');

exports.createInvestor = function(args, res, next) {
    const userId = args.user._id;

    const investor = {
        user: userId,
       	startdate: new Date(),
       	active: false,
    };
	
    UserModel.fetchUser({_id: userId})
    .then(user => {
    	if(user) {
	    	if(!user.isInvestor && !user.isAdvisor) {
				return InvestorModel.saveInvestor(investor);
			} else if (user.isInvestor) {
				return res.status(400).json({userId: userId, message:"User is an already Investor"});
			} else {
				return res.status(400).json({userId: userId, message:"User is an Advisor"});
			}	
		} else {
			return res.status(400).json({userId: userId, message: "No user found "});
		}
	})
	.then(investor => {
		if(investor) {
			return UserModel.updateInvestor({_id: investor.user}, investor._id)
		} else {
			return res.status(400).json({userId: userId, message: "No investor found"});
		}
	})
	.then(user => {
		if(user) {
			return res.status(200).json({_id: user.investor});
		}
	})
	.catch(err => {
		next(err);
	});
};

exports.getInvestor = function(args, res, next) {
 	const investorId = args.investorId.value;
   	
   	const options = {};
    options.fields = args.fields.value;
    
    const userId = args.user._id;

    UserModel.fetchUser({_id: userId})
    .then(user => {
    	if(user) {
	    	if(user.investor == investorId) {
			   	return InvestorModel.getInvestor({
			   		_id: investorId
			   	}, options);
		   	} else {
		   		return res.status(400).json({userId: userId, message: "User is not an investor"});
		   	}
	   	} else {
	   		return res.status(400).json({userId: userId, message: "No user found "});
	   	}
   	})
   	.then(investor => {
   		
   		if(investor){
   			if(options.fields.indexOf('performance') !=- 1) {
   				return HelperFunctions.updateInvestorPortfolioPerformance(investor);
   			} else {
				return res.status(200).json(investor);
			}
		} else {
			return res.status(400).json({investorId: investorId, message:"No Investor Found"});
		}
	})
	.then(investor => {
		return res.status(200).json(investor);	
	})
	.catch(err => {
		next(err);
	});  
};

exports.getFollowingAdvices = function(args, res, next) {

	const skip = args.skip.value;
	const limit = args.limit.value;
	const userId = args.user._id;
	const investorId = args.investorId.value;

	UserModel.fetchUser({_id: userId})
    .then(user => {
    	if(user) {
	    	if(user.isInvestor && user.investor == investorId) {
	
		    	return InvestorModel.getInvestor({
			        _id: investorId
			    }, {fields: 'followingAdvices'});
		    } else {
		   		return res.status(400).json({userId: userId, message: "Not Authorized"});
		   	}
	   	} else {
	   		return res.status(400).json({userId: userId, message: "No user found "});
	   	}
    })
    .then(output => {
    	if(output.followingAdvices) {
    		var following = output.followingAdvices;
    		following = following.splice(skip, limit);
    		return res.status(200).json({"followingAdvices":following});	
    	}
        
    })
    .catch(err => {
        next(err);
    });
};


exports.getFollowingAdvisors = function(args, res, next) {

	const skip = args.skip.value;
	const limit = args.limit.value;

	const userId = args.user._id;
	const investorId = args.investorId.value;

	UserModel.fetchUser({_id: userId})
    .then(user => {
    	if(user) {
	    	if(user.isInvestor && user.investor == investorId) {
			    return InvestorModel.getInvestor({
			        _id: investorId
			    }, {fields: 'followingAdvisors'});
		    } else {
		   		return res.status(400).json({userId: userId, message: "User is not an investor"});
		   	}
	   	} else {
	   		return res.status(400).json({userId: userId, message: "No user found "});
	   	}
   	})
    .then(output => {
    	if(output.followingAdvisors) {
    		var following = output.followingAdvisors;
    		following = following.splice(skip, limit);
    		return res.status(200).json({"followingAdvisors":following});	
    	}
        
    })
    .catch(err => {
        next(err);
    });
};

exports.createInvestorPortfolio = function(args, res, next) {
};

exports.updateInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const transactions = args.body.value;

	UserModel.fetchUser({_id: userId})
	.then(user => {
		if(user) {
			return InvestorModel.getInvestor({_id: user.investor}, 'portfolio');
		}
	})
	.then(investor => {
		if(investor) {
			return PortfolioModel.clonePortfolio({_id: investor.portfolio});

		}
	})
	.then(clonePortfolioId => {
		return Promise.all([InvestorModel.updatePortfolioHistory({_id: user.investor}, clonePortfolioId),
					HelperFunctions.updatePortfolioTransactions({_id: investor.portfolio}, transactions)]);	
	})
	.then(([updated, portfolio]) => {
		if(portfolio) {
			InvestorModel.addTransactions({_id: adviceId}, {stockTransactions: transactions})
		}
	});
};

exports.deleteInvestorPortfolio = function(args, res, next){
	const userId = args.user._id;
	
	UserModel.fetchUser({_id: userId})
	.then(user => {
		if(user) {
			return InvestorModel.getInvestor({_id: user.investor}, 'portfolio')
		}
	})
	.then(investor => {
		if(investor) {	
			return HelperFunctions.deletePortfolio(investor.portfolio);
		}
	});	
};


/*exports.followAdvice = function(args, res, next) {
    const userId = args.user._id.value;
   	
   	UserModel.fetchUser({_id: userId})
    .then(user => {
    	if(user) {
	    	if(user.isInvestor) {
			   	return InvestorModel.getInvestor({
			   		user: userId
			   	}, {fields:'_id'});
		   	} else {
		   		return res.status(400).json({userId: userId, message: "User is not an investor"});
		   	}
	   	} else {
	   		return res.status(400).json({userId: userId, message: "No user found "});
	   	}
   	})
   	.then(investorId => {
   		if(investorId){
   			return AdviceModel.updateFollowers({
		        _id: args.adviceId.value
		    }, investorId)
   		} else {
   			return res.status(400).json({userId: userId, message: "No investor found"});
   		}
   	})
    .then(advice => {
        return res.status(200);
    })
    .catch(err => {
        next(err);
    });
};*/

/*exports.subscribeAdvice = function(args, res, next) {
    const userId = args.user._id.value;
   
   	UserModel.fetchUser({_id: userId})
    .then(user => {
    	if(user) {
	    	if(user.isInvestor) {
			   	return InvestorModel.getInvestor({
			   		user: userId
			   	}, {fields:'_id'});
		   	} else {
		   		return res.status(400).json({userId: userId, message: "User is not an investor"});
		   	}
	   	} else {
	   		return res.status(400).json({userId: userId, message: "No user found "});
	   	}
   	})
   	.then(investorId => {
   		if(investorId){
   			return AdviceModel.updateSubscribers({
		        _id: args.adviceId.value
		    }, investorId)
   		} else {
   			return res.status(400).json({userId: userId, message: "No investor found"});
   		}
   	})
    .then(advice => {
        return res.status(200);
    })
    .catch(err => {
        next(err);
    });
};*/
