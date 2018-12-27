/*
* @Author: Shiv Chawla
* @Date:   2017-02-25 16:53:52
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-27 16:21:33
*/

'use strict';
const _ = require('lodash');
const UserModel = require('../../models/user');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioHelper = require("../helpers/Portfolio");
const AdviceHelper = require("../helpers/Advice");
const HelperFunctions = require("../helpers");
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
			APIError.throwJsonError({userId: userId, message:"Advisor already exists", errorCode: 1202});
		}	
	})
	.then(advisor => {
		if(advisor) {
			return res.status(200).json(advisor);
		} else {
			APIError.throwJsonError({userId: userId, message:"Internal error creating advisor", errorCode: 1203});
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

    options.fields = options.fields.concat(publicProfileFields);

    options.orderParam = "latestAnalytics."+(args.orderParam.value || 'rating.current');
    options.order = args.order.value || -1;

    const search = args.search.value;
    var query = {};
    if (search) {
        query.$text = {$search: search};
    }

    const registered = args.registered.value;
    if (registered) {
    	var registeredCategories = registered.split(",").map(item => {return item.trim() == "1";});
        query = {$and:[query, {'profile.isSebiRegistered':{$in: registeredCategories}}]};
    }

    const company = args.company.value;
    if (company) {
    	var companyCategories = company.split(",").map(item => {return item.trim() == "1";});
    	query = {$and:[query, {'profile.isCompany':{$in: companyCategories}}]};
    }

    const following = args.following.value;

    const userId = args.user._id;
    return InvestorModel.fetchInvestor({user:userId}, {fields: '_id', insert: true})
    .then(userInvestorId => {
        if (following) {
            query.followers = {'$elemMatch':{investor: userInvestorId, active:true}};
        } 

        return AdvisorModel.fetchAdvisors(query, options)
    })
    .then(advisors => {
    	if(advisors) {
			return res.status(200).json(advisors.filter(item => {return item && item.user}));
		} else {
			APIError.throwJsonError({message: "No advisors found", errorCode: 1204});
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
    
    let isOwner;
    let isAdmin;

    return Promise.all([
    	HelperFunctions.getAdminAdvisor(userId),
		AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'})
	])
    .then(([adminAdvisor, userAdvisor]) => {
    	let adviceQuery = {deleted: false, advisor: advisorId};
    	const adviceOptions = {};

    	adviceOptions.fields = '_id name approvalStatus prohibited latestAnalytics performanceSummary rating';

    	isAdmin = adminAdvisor && userAdvisor ? userAdvisor._id.equals(adminAdvisor._id) : false;
    	isOwner = userAdvisor && advisorId ? userAdvisor._id.equals(advisorId) : false;
    	if(!isOwner) {
    		options.fields = 'approved latestAnalytics user followers ' + publicProfileFields;
    		adviceQuery.public = true;
    		//adviceOptions.fields= '_id name latestAnalytics latestPerformance';
    	} else if(isOwner && dashboard) {
    		options.fields = '-followers ';
    		adviceOptions.fields = adviceOptions.fields.concat(" ").concat("analytics");
    	} else {
    		options.fields = '-followers -analytics';
    	}
    
 		return Promise.all([
 			!isOwner ? InvestorModel.fetchInvestor({user:userId}, {fields: '_id'}) : null,
 			AdvisorModel.fetchAdvisor({_id: advisorId}, options),
 			AdviceModel.fetchAdvices(adviceQuery, adviceOptions)
            .then(([advices, ct]) => {
                if(advices) {

                    //THIS PIECE OF CODE IS IN ADVICE AS WELL
                    //MAKE IT CENTRALIZED
                    return Promise.map(advices, function(advice) {
                        let adviceId = advice._id;
                        return Promise.all([
                            AdviceHelper.getAdvicePnlStats(adviceId),
                            AdviceHelper.computeAdviceSubscriptionDetail(adviceId, userId)
                        ])
                        .then(([advicePnlStats, subscriptionDetail]) => {
                            return Object.assign(subscriptionDetail, advicePnlStats, advice.toObject());
                        });
                    });
                } else {
                    APIError.throwJsonError({message: "No advices found", errorCode: 1110});
                }
            })
		]);
	})
  	.then(([investor, advisor, advices]) => {
  		if(advisor) {
  			var isFollowing = !isOwner ? advisor.followers ? advisor.followers.filter(item => item.active).map(item => item.investor.toString()).indexOf(investor._id.toString()) != -1 : false : false;
			const maxAdvicesAllowed = config.get('max_advices_per_advisor');
			const nAdvices = advices ? advices : [];
			const nAdvisor = Object.assign({
				adviceLimitExceeded : nAdvices.length >= maxAdvicesAllowed,
				advices: nAdvices, 
				isOwner: isOwner, 
				isAdmin: isAdmin, 
				isFollowing: isFollowing
			}, advisor.toObject());
		  	delete nAdvisor.followers;

		  	return res.status(200).send(nAdvisor);
 		} else {
 			APIError.throwJsonError({advisorId: advisorId, message: "Advisor not found", errorCode: 1201});
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

    return new Promise((resolve, reject) => {
		if(profile.isCompany && (!profile.companyName || profile.companyName =="") && (!profile.companyRegistrationNum || profile.companyRegistrationNum =="")) {
			APIError.throwJsonError({message: "Company name and/or registration number required if advisor a company"});
		}

		if(profile.isSebiRegistered && (!profile.sebiRegistrationNum || profile.sebiRegistrationNum =="")) {
			APIError.throwJsonError({message: "SEBI registration number required if company/individual registered with SEBI"});
		}

		resolve(true);

    })	
    .then(valid => {
    	if (valid) {
    		return AdvisorModel.fetchAdvisor({user:userId, _id:advisorId}, {fields: '_id'});
		} else {
			APIError.throwJsonError({message: "Invalid profile settings", errorCode: 1205});
		}
	})
    .then(advisor => {
    	if(advisor) {

            var updates = {};
            Object.keys(profile).forEach(item => {
                updates[`profile.${item}`] = profile[item];
            });

			return AdvisorModel.updateAdvisor({_id:advisorId}, updates, {new:true, fields:'profile'})
		} else {
			APIError.throwJsonError({message: "Advisor not authorized to update profile", errorCode: 1206});
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

  	return Promise.all([
  		AdvisorModel.fetchAdvisor({_id: advisorId, user:{$ne:userId}}, {fields:'_id'}),
		InvestorModel.fetchInvestor({user:userId}, {fields:'_id', insert:true})
	])
  	.then(([advisor, investor]) => {
  		if(advisor && investor) {
    		const investorId = investor._id; 
    		return AdvisorModel.updateFollowers({
    						_id: advisorId}, investorId);
		} else {
			if(!investor) {
				APIError.throwJsonError({userId: userId, message: "Investor not found", errorCode: 1301});
			} else if(!advisor) {
				APIError.throwJsonError({userId: userId, message: "Advisor not found or Advisor same as user", errorCode: 1201});
			}
		}
	})
	.then(advisor => {
		if (advisor) {
			return res.status(200).json({count: advisor.followers.filter(item => item.active).length}); 
		}  else {
			APIError.throwJsonError({advisorId: advisorId, message: "Internal error updating investor", errorCode: 1307});
		}
	})
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

module.exports.approveAdvisor = function(args, res, next) {
	const userId = args.user._id;
	const advisorId = args.advisorId.value;
	const approval = args.body.value;

	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {fields:'_id'})
	.then(users => {
		if(users) {
			if(users.map(item => item._id.toString()).indexOf(userId.toString()) !=-1) {
				return AdvisorModel.updateApproval({_id:advisorId}, Object.assign({user: userId}, approval));
			} else {
				APIError.throwJsonError({message: "User not authorized to approve", errorCode: 1505});
			}
		} else {
			APIError.throwJsonError({message: " No authorized user found to approve", errorCode: 1501});
		}
	})
	.then(advisor => {
		return res.status(200).send({message: "Approval updated successfully"});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

module.exports.fetchAdvisorByName = function(args, res, next) {
	const name = _.get(args, 'name.value', '').split(" ");

    let firstName = ''
    let lastName = '';

    if (name.length > 1) {
        firstName = name[0];
        lastName = name[1];
    } else if(name.length == 1) {
        firstName = name[0];
    }

    const skip = _.get(args, 'skip.value', 0);
	const limit = _.get(args, 'limit.value', 10); 

    const userId = args.user._id;

    return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {fields:'_id'})
    .then(users => {
        if((users||[]).map(item => item._id.toString()).indexOf(userId.toString()) == -1) {
            APIError.throwJsonError({message: "User not authorized to fetch advisors", errorCode: 1505});
        } else {
            return;
        }
    })
    .then(() => {
        let dummyAdvisors = config.get('dummy_advisors');
        var query;

        if (firstName == '' && lastName == '' && dummyAdvisors.length > 0) {
            query = {email:{$in: dummyAdvisors}};
        } else {
            const firstNameQuery = {firstName: {$regex: `${firstName}`, $options: "i"}};
            const lastNameQuery = {lastName: {$regex: `${lastName}`, $options: "i"}};
            query = {$or: [firstNameQuery, lastNameQuery]}; 
        }

        return UserModel.fetchUsers(query, {firstName: 1, lastName: 1, email: 1}, {skip, limit});
    })
    .then(users => {
        return Promise.map(users, user => {
            return AdvisorModel.fetchAdvisor({user: user._id}, {fields: '_id user'})
            .then(advisor => {
                return {...advisor.toObject()};
            })
        })
    })
	.then(advisors => {
		return res.status(200).send(advisors);
	})
	.catch(err => {
		console.log(err);
		return res.status(400).send(err.message);
	})
}

function farfuture() {
	return new Date(2200, 1, 1);
}

