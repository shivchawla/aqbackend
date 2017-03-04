/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:52
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-04 13:18:40
*/

'use strict';
const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const UserModel = require('../models/user');
const Promise = require('bluebird');

exports.createAdvisor = function(args, res, next) {
    const userId = args.user._id;

    const advisor = {
        user: userId,
       	startdate: new Date(),
       	active: false,
    };

	UserModel.fetchUser({_id: userId})
	.then(user => {
		if (user) {
			if(!user.isInvestor && !user.isAdvisor) {
				return AdvisorModel.saveAdvisor(advisor);
			} else if (user.isInvestor) {
				return res.status(400).json({_id: userId, message:"User is an Investor"});
			} else {
				return res.status(400).json({_id: userId, message:"User is already an Advisor"});
			}
		} else {
			return res.status(400).json({_id: userId, message: "No user found "});
		}
	})
	.then(advisor => {
		if(advisor) {
			return UserModel.updateAdvisor({_id: advisor.user}, advisor._id)
		} else {
			return res.status(400).json({userId: userId, message:"Advisor can't be created"});
		}
	})
	.then(user => {
		if(user) {
			return res.status(200).json({advisorId: user.advisor});
		} else {
			return res.status(400).json({userId: arg.userId, message: "No user found "});
		}
	})
	.catch(err => {
		next(err);
	});
};

exports.followAdvisor = function(args, res, next) {
    const user = args.user;
  	const advisorId = args.advisorId.value;

  	UserModel.fetchUser({_id: user._id})
  	.then(user => {
  		if(user) {
  			if (user.isInvestor) {

	    		const investorId = user.investor; 

	    		return Promise.all([AdvisorModel.updateFollowers({
	    						_id: advisorId}, investorId),

							InvestorModel.updateFollowing({
				    			_id: investorId}, advisorId, "advisor"
							    		)]
				);
			} else {
				return res.status(400).json({userId: user._id, message: "User is not an Investor"});
			}
		} else {
			return res.status(400).json({userId: user._id, message: "User not found"});
		}
	})
	.then(([advisor, investor]) => {
		if (advisor && investor) {
			return res.status(200).json({followers:advisor.followers, count: advisor.followers.length}); 
		} else if(!investor) {
			return res.status(400).json({userId:user._id, message: "No Investor found"});
		} else if(!advisor){
			return res.status(400).json({advisorId: advisorId, message: "No Advisor found"});
		}
	})
    .catch(err => {
        next(err);
    });
};

exports.getFollowers = function(args, res, next) {
	
	//TODO: send relevant information about the followers (PUBLIC profile)
	const userId = args.user._id;

	UserModel.fetchUser({_id: userId})
  	.then(user => {
  		if(user) {
  			if (user.isInvestor) {
			    return AdvisorModel.getAdvisor({
			        _id: args.advisorId.value
			    }, {fields: 'followers'});
		    } else {
		    	return res.status(400).json({userId: userId, message: "User is not an Investor"});
		    }
	    } else {
	    	return res.status(400).json({userId: userId, message: "User not found"});
    	}
    })
    .then(output => {
    	if(output) {
    		if(output.followers){
	    		return res.status(200).json({followers:output.followers, count:output.followers.length});
    		} else{
    			return res.status(200).json({followers:[], count:0});
    		}	
    	}
        
    })
    .catch(err => {
        next(err);
    });
};

exports.getAdvisors = function(args, res, next) {
    
    const options = {};
    options.limit = args.limit.value;
    options.skip = args.skip.value;
    options.fields = args.fields.value;
    options.sort = args.sort.value;
    const userId = args.user._id;

    UserModel.fetchUser({_id: userId})
    .then(user => {
    	if(user) {
    		if (user.isInvestor) {
    			return AdvisorModel.getAllAdvisors({}, options);
			} else {
				return res.status(400).json({userId: userId, message: "User is not an investor"});	
			}
		} else {
			return res.status(400).json({userId: userId, message: "User not found"});
		}
	})
    .then(advisors => {
    	if(advisors) {
    		return res.status(200).json(advisors);
    	} else {
    		return res.status(400).json({message:"No advisors found"});
    	}
    })
    .catch(err => {
        next(err);
    });
};

exports.getAdvisor = function(args, res, next) {
	const advisorId = args.advisorId.value;
    const userId = args.user._id;

    const options = {};
    options.fields = args.fields.value;
    
    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user) {
    		console.log("Is Advisor: "+ user.isAdvisor);
    		console.log(user.advisor);
    		console.log("Is Investor" + user.isInvestor);
    		console.log(user.investor);

    		//TODO: options when user is investor/advisor
	    	if(user.isInvestor) {
			 	return AdvisorModel.getAdvisor({
			        _id: advisorId
			    }, options);
		    } else if(user.isAdvisor && user.advisor == advisorId) {
		    	return AdvisorModel.getAdvisor({
			        _id: advisorId
			    }, options);
		    } else {
		    	return res.status(400).json({userId: userId, message: "User is neither an investor nor an advisor"});
		    }
	    } else {
	    	return res.status(400).json({userId: userId, message: "User not found"});
	    }
    })
  	.then(advisor => {
  		return res.status(200).json(advisor);
  	})
  	.catch(err => {
      	next(err);
  	});
};

function farfuture() {
	return new Date(2200, 1, 1);
}

