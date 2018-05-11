/*
* @Author: Shiv Chawla
* @Date:   2018-03-05 12:10:56
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-05-11 18:03:46
*/
'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const Promise = require('bluebird');
const WebSocket = require('ws'); 
const config = require('config');
const PerformanceHelper = require("../helpers/Performance");
const PortfolioHelper = require("../helpers/Portfolio");
const AdvisorHelper = require("../helpers/Advisor");
const DateHelper = require("../../utils/Date");
const APIError = require('../../utils/error');
const WSHelper = require('./WSHelper');

function _filterActive(objs) {
	return objs ? objs.filter(item => {return item.active == true}).length : 0;	
} 


module.exports.getAdviceAccessStatus = function(adviceId, userId) {
	return Promise.all([
		userId ? AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}) : null,
		userId ? InvestorModel.fetchInvestor({user: userId}, {fields:'_id', insert:true}) : null,
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: 'advisor subscribers followers'}),
		AdvisorHelper.getAdminAdvisor(userId)
	])
	.then(([advisor, investor, advice, adminAdvisor]) => {

		if(!advisor && userId) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1201});
		}

		if(!investor && userId) {
			APIError.throwJsonError({message: "Advisor not found", errorCode: 1301});	
		}

		if(!advice) {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});	
		}

		var activeSubscribers = advice.subscribers.filter(item => {return item.active == true});
		var activeFollowers = advice.followers.filter(item => {return item.active == true});

		var subscribedIndex = investor ? activeSubscribers.map(item => item.investor.toString()).indexOf(investor._id.toString()) : -1;
		var isSubscribed = subscribedIndex != -1;

		let subscriptionDetail = {};

		if (isSubscribed) {
			var subscriber = activeSubscribers[subscribedIndex];
			var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds
			subscriptionDetail = {
				unsubscriptionPending: subscriber.discontinueRequested,
				subscriptionStartDate: subscriber.startDate,
				subscriptionEndDate: subscriber.endDate,
				subscriptionPendingDays: subscriber.endDate && subscriber.startDate ? Math.round(Math.abs((subscriber.endDate.getTime() - subscriber.startDate.getTime())/(oneDay))) : -1,
			};
		}

		var isFollowing = investor ? activeFollowers.map(item => item.investor.toString()).indexOf(investor._id.toString()) != -1 : false;

		return  Object.assign({subscriptionDetail: subscriptionDetail}, {
			isAdmin: advisor && adminAdvisor ? advisor.equals(adminAdvisor._id) : false,
			isOwner: advisor && advice.advisor ? advisor.equals(advice.advisor) : false,
			isFollowing: isFollowing,
			isSubscribed: isSubscribed,
		});
	});
};

module.exports.computeAdviceSubscriptionDetail = function(adviceId, userId) {
	
	return Promise.all([
		AdviceModel.fetchAdvice({_id:adviceId}, {field:'advisor subscribers followers'}),
		exports.getAdviceAccessStatus(adviceId, userId)
	])
	.then(([advice, adviceAccessStatus]) => {
		
		if(!advice) {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});	
		}

		var activeSubscribers = advice.subscribers.filter(item => {return item.active == true});
		var activeFollowers = advice.followers.filter(item => {return item.active == true});
		var numSubscribers = activeSubscribers.length;
		var numFollowers = activeFollowers.length;
		
		return Object.assign({
			numFollowers: numFollowers,
			numSubscribers: numSubscribers}, adviceAccessStatus);
	});
};

module.exports.isUserAuthorizedToViewAdviceDetail = function(adviceId, userId) {
	return exports.getAdviceAccessStatus(adviceId, userId)
	.then(adviceAccessStatus  => {
		return  Object.assign({authorized : adviceAccessStatus.isAdmin || adviceAccessStatus.isOwner || adviceAccessStatus.isSubscribed}, adviceAccessStatus); 
	});
}

module.exports.isUserAuthorizedToViewAdviceSummary = function(adviceId, userId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert: true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor prohibited public subscribers'})])
	.then(([advisor, advice])  => {
		if(advisor && advice) {
			const advisorId = advisor._id;
			
			//PERSONAL or subscribers
			//get to see expanded portfolio if chosen
			return advice.advisor.equals(advisorId) || (advice.public == true && advice.prohibited == false)
				
		} else if(!advisor) {
			APIError.throwJsonError({message:"Advisor not found", errorCode: 1201});
		} else if (!advice) {
			APIError.throwJsonError({message:"Advice not found", errorCode: 1101});
		} 
	});
}

module.exports.computeAdviceAnalytics = function(adviceId, date) {
	let subscribers;
	let followers;
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'subscribers followers analytics'})
	.then(advice => {
		if (advice) {
			var analyticsLastTwoDays = advice.analytics ? advice.analytics.slice(-2) : [];
			var currentDate = DateHelper.getCurrentDate();

			var currentDayData = analyticsLastTwoDays.length > 1 ? analyticsLastTwoDays[1] : analyticsLastTwoDays.length > 0 ? analyticsLastTwoDays[0] : null;
			var lastDayData = analyticsLastTwoDays.length > 1 ? analyticsLastTwoDays[0] : null;

			var datePresent = false;
			if (currentDayData) {
				datePresent =  currentDayData.date ? DateHelper.compareDates(currentDayData.date, currentDate) == 0 : false;
			}

			var numSubscribers = _filterActive(advice.subscribers);
			var numFollowers = _filterActive(advice.followers);
			var dailyChgSubscribers = datePresent ? 
					numSubscribers - (lastDayData ? lastDayData.numSubscribers : 0) :
					numSubscribers - (currentDayData ? currentDayData.numSubscribers : 0); 

			var dailyChgFollowers = datePresent ? 
					numFollowers - (lastDayData ? lastDayData.numFollowers : 0) :
					numFollowers - (currentDayData ? currentDayData.numFollowers : 0); 
			
			
			return {
				date: currentDate,
				numSubscribers: numSubscribers,
				numFollowers: numFollowers,
				dailyChgFollowers: dailyChgFollowers,
				dailyChgSubscribers: dailyChgSubscribers
			};
		
		} else {
			APIError.throwJsonError({message: "Advice not found", errorCode: 1101});
		}
	}); 
};

//RECALCULATE IS NOT USED - 23/03/2018
module.exports.getAdviceAnalytics = function(adviceId, recalculate) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio latestAnalytics'})
	.then(advice => {
		if (!advice.latestAnalytics || recalculate) {
			return exports.computeAdviceAnalytics(adviceId);
		} else {
			return advice.latestAnalytics;
		}
	});
};

module.exports.validateAdvice = function(advice, oldAdvice, strictNetValue) {

	return new Promise((resolve, reject) => {
		var msg = JSON.stringify({action:"validate_advice", 
            						advice: advice,
            						lastAdvice: oldAdvice ? oldAdvice : "",
            						strictNetValue: strictNetValue ? strictNetValue : false});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

module.exports.updateAdviceAnalyticsAndPerformanceSummary = function(adviceId, date) {
	return Promise.all([
			exports.computeAdviceAnalytics(adviceId, date),
			PerformanceHelper.computeAdvicePerformanceSummary(adviceId, date)
	])
	.then(([adviceAnalytics, advicePerformanceSummary]) => {
		return AdviceModel.updateAnalyticsAndPerformance({_id: adviceId}, {analytics: adviceAnalytics, performanceSummary: advicePerformanceSummary});
	})
	.then(advice => {
		if (advice) {
			return {latestAnalytics: advice.latestAnalytics, performanceSummary: advice.performanceSummary};
		} else{
			return {latestAnalytics: null, performanceSummary: null};
		}
	});
};
