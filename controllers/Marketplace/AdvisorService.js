/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:52
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-07 13:19:30
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const config = require('config');

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
    options.fields = 'approved latestAnalytics user ';

    var publicProfileFields = config.get('advisor_public_profile_fields').map(item => "profile."+item).join(" ");

    options.fields= options.fields.concat(publicProfileFields);

    options.orderParam = "latestAnalytics."+(args.orderParam.value || 'rating');
    options.order = args.order.value || -1;

    const userId = args.user._id;

    return AdvisorModel.fetchAdvisors({}, options)
    .then(advisors => {
    	if(advisors) {

			return res.status(200).json(advisors);
		} else {
			APIError.throwJsonError({message: "No advisors found"});
		}
    })
    .catch(err => {
    	res.status(400).send(err.message);
    });
};

module.exports.getAdvisorSummary = function(args, res, next) {
	const advisorId = args.advisorId.value;
   	const userId = args.user._id;
   	const dashboard = args.dashboard.value;
    
    const options = {};
 	var publicProfileFields = config.get('advisor_public_profile_fields').map(item => "profile."+item).join(" ");
    
    return AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'})
    .then(userAdvisor => {
    	let adviceQuery = {deleted: false, advisor: advisorId};
    	const adviceOptions = {};

    	adviceOptions.fields = '_id name latestAnalytics latestPerformance';

    	if(!userAdvisor._id.equals(advisorId)) {
    		options.fields = 'approved latestAnalytics user ' + publicProfileFields;
    		adviceQuery.public = true;
    		adviceOptions.fields= '_id name latestAnalytics latestPerformance';
    	} else if(userAdvisor._id.equals(advisorId) && dashboard) {
    		options.fields = '-followers ';
    		adviceOptions.fields = '_id name analytics';
    	} else {
    		options.fields = '-followers -analytics';
    	}
    
 		return Promise.all([
 			AdvisorModel.fetchAdvisor({_id: advisorId}, options),
 			AdviceModel.fetchAdvices(adviceQuery, adviceOptions)
		]);
	})
  	.then(([advisor, advices]) => {
  		if(advisor) {
		  	return res.status(200).send(Object.assign({advices: advices ? advices : []}, advisor.toObject()));
 		} else {
 			APIError.throwJsonError({advisorId: advisorId, message: "Advisor not found"});
 		}
  	})
  	.catch(err => {
      	return res.status(400).send(err.message);
  	});
};

module.exports.updateAdvisorProfile = function(args, res, next) {
    
    const profile = args.body.value;

    const userId = args.user._id;
    const advisorId = args.advisorId.value;

    return AdvisorModel.fetchAdvisor({user:userId, _id:advisorId}, {fields: '_id'})
    .then(advisor => {
    	if(advisor) {
			return AdvisorModel.updateAdvisor({_id:advisorId}, {profile: profile}, {new:true, fields:'-followers -analytics'})
		} else {
			APIError.throwJsonError({message: "No advisor found/Not authorized"});
		}
    })
    .then(advisor => {
    	return res.status(200).send(advisor);
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

