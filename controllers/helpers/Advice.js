/*
* @Author: Shiv Chawla
* @Date:   2018-03-05 12:10:56
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-05 19:06:52
*/
'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const Promise = require('bluebird');
const config = require('config');
const PerformanceHelper = require("../helpers/Performance");
const APIError = require('../../utils/error');

module.exports.computeAdviceSubscriptionDetail = function(adviceId, advisorId, investorId) {
	
	return AdviceModel.fetchAdvice({_id:adviceId}, {field:'advisor subscribers followers analytics'})
	.then(advice => {
		//var nAdvice = {};

		var isFollowing = false;
		var isSubscribed = false;
		var isOwner = advisorId.equals(advice.advisor._id);

		var activeSubscribers = advice.subscribers.filter(item => {return item.active == true});
		var activeFollowers = advice.followers.filter(item => {return item.active == true});
		var numSubscribers = activeSubscribers.length;
		var numFollowers = activeFollowers.length;

		if(!advisorId.equals(advice.advisor._id)) {
			isFollowing = activeFollowers.map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
			isSubscribed = activeSubscribers.map(item => item.investor.toString()).indexOf(investorId.toString()) != -1;
		} 

		var adviceAnalytics = advice.analytics;
		var numAdviceAnalytics = adviceAnalytics.length;

		var latestAnalytics = numAdviceAnalytics > 0 ? adviceAnalytics[numAdviceAnalytics - 1] : null;

		//delete nAdvice.subscribers;
		//delete nAdvice.followers;
		//delete nAdvice.analytics;

		return {
			latestAnalytics: latestAnalytics, 
			isFollowing: isFollowing, 
			isSubscribed: isSubscribed, 
			isOwner: isOwner,
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
			APIError.throwJsonError({message:"Investor not found"});
		} else if(!advisor) {
			APIError.throwJsonError({message:"Advisor not found"});
		} else if (!advice) {
			APIError.throwJsonError({message:"Advice not found"});
		} 
	});
}

module.exports.computeAdvicePerformanceSummary = function(adviceId) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio'})
	.then(advice => {
		return PerformanceHelper.getPerformanceSummary(advice.portfolio)
	})
	.then(performanceSummary => {
		return {performance: performanceSummary};
	})
	.catch(err => {
		return {error: err.message};
	});
};