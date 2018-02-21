/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:52
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-20 14:48:39
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const APIError = require('../../utils/error');
const Promise = require('bluebird');

module.exports.createAdvisor = function(args, res, next) {
    const userId = args.user._id;

    return AdvisorModel.fetchAdvisor({user:userId}, {})
	.then(advisor => {
		if(!advisor) {
			return AdvisorModel.saveAdvisor({user:userId})
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

module.exports.getAdvisors = function(args, res, next) {
    
    const options = {};
    options.limit = args.limit.value;
    options.skip = args.skip.value;
    options.fields = args.fields.value;
    options.sort = args.sort.value;
    const userId = args.user._id;

    return AdvisorModel.fetchAdvisors({}, options)
    .then(advisors => {
    	if(advisors) {
    		return Promise.all([advisors, 
    			Promise.map(advisors, function(advisor) {
    				return AdviceModel.fetchAdvices({advisor: advisor, deleted: false}, {});
    			})
			])
		} else {
    		APIError.throwJsonError({message:"No advisors found"});
    	}
	})
	.then(([advisors, advices]) => {
		
		advisors = JSON.parse(JSON.stringify(advisors));
		
		advisors.forEach((advisor, i) => {
			advisor["adviceCount"] = advices[i].length;
		});

		return res.status(200).json(advisors);
    })
    .catch(err => {
    	res.status(400).send(err.message);
    });
};

module.exports.getAdvisorSummary = function(args, res, next) {
	const advisorId = args.advisorId.value;
   	const userId = args.user._id;
    
    const options = {};
    options.fields = 'user rating followers profile'
    
 	return Promise.all([AdvisorModel.fetchAdvisor({_id: advisorId}, options), 
 		//Fetch advice performance (aggregate it or send the summary for each advisr.
 		//NEEDS summary definition)
 		AdviceModel.fetchAdvices({advisor: advisorId, deleted: false}, {fields:'advicePerformance'})])
  	.then(([advisor, advices]) => {
  		if(advisor && advices) {
  			advisor = JSON.parse(JSON.stringify(advisor));
		  	advisor["adviceCount"] = advices.length;
		  	advisor.followers = advisor.followers.map(item => {return item.active == true;}).length; 
		  	advisor.rating = advisor.rating.length > 0 ? advisor.rating[advisor.rating.length - 1] : 0.0;
		  	
		  	delete advisor.advices;
		  	
		  	return res.status(200).json(advisor);
 		} else {
 			APIError.throwJsonError({advisorId: advisorId, message: "Advisor/Advices not found"});
 		}
  	})
  	.catch(err => {
      	return res.status(400).send(err.message);
  	});
};

//NEEDS more work..Wha to return??
module.exports.getAdvisorDetail = function(args, res, next) {
	const advisorId = args.advisorId.value;
    const userId = args.user._id;

    //TODO: options when user is investor/advisor
    const options = {};
    options.fields = args.fields.value;
    
	AdvisorModel.fetchAdvisor({user: userId}, options)
  	.then(advisor => {
  		if(advisor && advisor._id.equals(advisorId)) {
  			return res.status(200).json(advisor);
		} else {
			APIError.throwJsonError({message:"Advisor not found or not authorized"});
		}
  	})
  	.catch(err => {
      	return res.status(400).send(err.message);
  	});
};

module.exports.followAdvisor = function(args, res, next) {
    const userId = args.user._id;
  	const advisorId = args.advisorId.value;

  	return Promise.all([AdvisorModel.fetchAdvisor({_id: advisorId, user:{$ne:userId}}, {fields:'_id'}),
  					InvestorModel.fetchInvestor({user:userId}, {fields:'_id', insert:true})])
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
				APIError.throwJsonError({userId: userId, message: "Advisor not found or Advisor same as user"});
			}
		}
	})
	.then(([advisor, investor]) => {
		if (advisor && investor) {
			return res.status(200).json({count: advisor.followers.length}); 
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

function farfuture() {
	return new Date(2200, 1, 1);
}

