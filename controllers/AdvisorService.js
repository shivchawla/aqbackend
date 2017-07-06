/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:52
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-07-03 16:05:11
*/

'use strict';
const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const UserModel = require('../models/user');
const AdviceModel = require('../models/advice');
const APIError = require('../utils/error');
const Promise = require('bluebird');

exports.createAdvisor = function(args, res, next) {
    const userId = args.user._id;

    AdvisorModel.fetchAdvisor({user:userId}, {})
	.then(advisor => {
		if(!advisor) {
			return AdvisorModel.saveAdvisor({user:userId}, {user: userId})
		} else {
			APIError.throwJsonError({userId: userId, message:"Advisor already exists"});
		}	
	})
	.then(advisor => {
		if(advisor) {
			return res.status(200).json(advisor);
		} else {
			APIError.throwJsonError({userId: userId, message:"Advisor can't be created"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

exports.getAdvisors = function(args, res, next) {
    
    const options = {};
    options.limit = args.limit.value;
    options.skip = args.skip.value;
    options.fields = args.fields.value;
    options.sort = args.sort.value;
    const userId = args.user._id;

    AdvisorModel.getAllAdvisors({}, options)
    .then(advisors => {
    	if(advisors) {
    		return res.status(200).json(advisors);
    	} else {
    		APIError.throwJsonError({message:"No advisors found"});
    	}
    })
    .catch(err => {
    	res.status(400).send(err.message);
    });
};

exports.getAdvisorSummary = function(args, res, next) {
	const advisorId = args.advisorId.value;
   
    //TODO: options when user is investor/advisor
    const options = {};
    options.fields = 'user performance rating subscribers advices'
    
 	AdvisorModel.fetchAdvisor({_id: advisorId}, options)
  	.then(advisor => {
  		if(advisor) {
  			return res.status(200).json(advisor);
 		} else {
 			APIError.throwJsonError({advisorId: advisorId, msg: "Advisor not found"});
 		}
  	})
  	.catch(err => {
      	return res.status(400).send(err.message);
  	});
};

exports.getAdvisorDetail = function(args, res, next) {
	const advisorId = args.advisorId.value;
    const userId = args.user._id;

    //TODO: options when user is investor/advisor
    const options = {};
    options.fields = args.fields.value;
    
	AdvisorModel.fetchAdvisor({user: userId, _id: advisorId}, options)
  	.then(advisor => {
  		if(advisor) {
  			return res.status(200).json(advisor);
		} else {
			APIError.throwJsonError({msg:"Advisor not found or not authorized"});
		}
  	})
  	.catch(err => {
      	return res.status(400).send(err.message);
  	});
};

exports.followAdvisor = function(args, res, next) {
    const userId = args.user._id;
  	const advisorId = args.advisorId.value;

  	Promise.all([AdvisorModel.fetchAdvisor({_id: advisorId},{fields:'_id'}),
  					InvestorModel.fetchInvestor({user:userId}, {fields:'_id'})])
  	.then(([advisor, investor]) => {
  		if(advisor && investor) {
    		const investorId = investor._id; 
    		return Promise.all([AdvisorModel.updateFollowers({
    						_id: advisorId}, investorId),

						InvestorModel.updateFollowing({
			    			_id: investorId}, advisorId, "advisor"
						    		)]
			);
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found"});
			} else if(!advisor) {
				APIError.throwJsonError({userId: userId, message: "Advisor not found"});
			}
		}
	})
	.then(([advisor, investor]) => {
		if (advisor && investor) {
			return res.status(200).json({followers:advisor.followers, count: advisor.followers.length}); 
		} else if(!investor) {
			APIError.throwJsonError({userId:userId, message: "Advisor can't be updated"});
			
		} else if(!advisor) {
			APIError.throwJsonError({advisorId: advisorId, message: "Investor can't be updated"});
			
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

exports.getFollowers = function(args, res, next) {
	
	//TODO: send relevant information about the followers (PUBLIC profile)
	const userId = args.user._id;
	const advisorId = args.advisorId.value;
	
	AdvisorModel.fetchAdvisor({user: userId, _id: advisorId}, {fields:'followers'})
    .then(advisor => {
    	if(advisor) {
    		if(advisor.followers) {
	    		return res.status(200).json({followers:output.followers, count:output.followers.length});
    		} else{
    			return res.status(200).json({followers:[], count:0});
    		}	
    	} else {
    		APIError.throwJsonError({msg:"No advisor found"});
    	}
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

exports.getAdvisorAdvicesWithStock = function(args, res, next) {
	const userId = args.user._id;

	const ticker = ags.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const security = {ticker: ticker, 
						exchange: exchange, 
						securityType: securityType,
						country: country};

	return AdvisorModel.fetchAdvisor({user: userId},{fields:'advices'})
	.then(advisor => {
		if(advisor) {
			if(advisor.advices) {
				return Promise.all([advisor.advices.forEach(advice => {
						return AdviceModel.fetchAdvice({_id: advice._id}, {fields: 'portfolio'})
					})]);
			} else {
				APIError.throwJsonError({msg: "No advices found"});
			}
		} else {
			APIError.throwJsonError({userId: userId, msg: "No advisor found"})
		}
	})
	.then(([advices])=> {
		if(advices) {
			var advicesWithStock = [];
			advices.forEach(advice => {
				var idx = advice.portfolio.positions.map(item => item.security).indexOf(security);
				
				if (idx != -1) {
					advicesWithStock.push({
							_id: advice._id,
							name: advice.name,
							description: advice.description,
							position: advice.portfolio.positions[idx]
						});
				}

			});

			return res.status(200).json(advicesWithStock);

		} else {
			APIError.throwJsonError({msg: "No advices found"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})    
};

function farfuture() {
	return new Date(2200, 1, 1);
}

