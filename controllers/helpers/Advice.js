/*
* @Author: Shiv Chawla
* @Date:   2018-03-05 12:10:56
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-16 19:48:47
*/
'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const Promise = require('bluebird');
const config = require('config');
const HelperFunctions = require("../helpers");
const PerformanceHelper = require("../helpers/Performance");
const APIError = require('../../utils/error');

module.exports.getAdviceAccessStatus = function(adviceId, userId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: 'advisor'}),
		HelperFunctions.getAdminAdvisor(userId)
	])
	.then(([advisor, advice, adminAdvisor]) => {

		return  {
			isAdmin: advisor && adminAdvisor ? advisor.equals(adminAdvisor._id) : false,
			isOwner: advisor && advice.advisor ? advisor.equal(advice.advisor) : false
		};
	});
};

module.exports.computeAdviceSubscriptionDetail = function(adviceId, userId) {
	
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
		InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true}),
		AdviceModel.fetchAdvice({_id:adviceId}, {field:'advisor subscribers followers'}),
		HelperFunctions.getAdminAdvisor(userId)
	])
	.then(([advisor, investor, advice, adminAdvisor]) => {
		
		if(!advisor) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1201});
		}

		if(!investor) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1301});	
		}

		if(!advice) {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});	
		}

		const investorId = investor._id;
		var isFollowing = false;
		var isSubscribed = false;
		
		var isAdmin = adminAdvisor && advisor ? advisor.equals(adminAdvisor._id) : false;
		var isOwner = advisor && advice.advisor ? advisor.equals(advice.advisor) : false;

		var activeSubscribers = advice.subscribers.filter(item => {return item.active == true});
		var activeFollowers = advice.followers.filter(item => {return item.active == true});
		var numSubscribers = activeSubscribers.length;
		var numFollowers = activeFollowers.length;

		var isFollowing = activeFollowers.map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
		var isSubscribed = activeSubscribers.map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
		
		return {
			isFollowing: isFollowing, 
			isSubscribed: isSubscribed, 
			isOwner: isOwner,
			isAdmin: isAdmin,
			numFollowers: numFollowers,
			numSubscribers: numSubscribers
		};
	});
};

module.exports.isUserAuthorizedToViewAdviceDetail = function(userId, adviceId) {
	return Promise.all([
		InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert: true}),
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert: true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor followers subscribers'})])
	.then(([investor, advisor, advice])  => {
		if(investor && advisor && advice) {
			const advisorId = advisor._id;
			
			var activeSubscribers = advice.subscribers.filter(item => {return item.active == true}).map(item => item.investor.toString());
			
			const investorId = investor._id.toString();
			//PERSONAL or subscribers
			//get to see expanded portfolio if chosen
			return advice.advisor.equals(advisorId) || activeSubscribers.indexOf(investorId) != -1;
				
		} else if(!investor) {
			APIError.throwJsonError({message:"Investor not found", errorCode: 1301});
		} else if(!advisor) {
			APIError.throwJsonError({message:"Advisor not found", errorCode: 1201});
		} else if (!advice) {
			APIError.throwJsonError({message:"Advice not found", errorCode: 1101});
		} 
	});
}

module.exports.computeAdvicePerformanceSummary = function(adviceId) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio'})
	.then(advice => {
		if (advice) {
			return PerformanceHelper.getPerformanceSummary(advice.portfolio)
		} else {
			return null;
		}
	})
	.then(performanceSummary => {
		return {performance: performanceSummary};
	})
	.catch(err => {
		return {performance: {error: err.message}};
	});
};