/*
* @Author: Shiv Chawla
* @Date:   2018-03-05 12:10:56
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-10 16:31:30
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

function _filterActive(objs) {
	return objs ? objs.filter(item => {return item.active == true}).length : 0;	
} 

module.exports.getAdviceAccessStatus = function(adviceId, userId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert:true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted: false}, {fields: 'advisor'}),
		AdvisorHelper.getAdminAdvisor(userId)
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
		AdvisorHelper.getAdminAdvisor(userId)
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
		AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor subscribers'})])
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

module.exports.isUserAuthorizedToViewAdviceSummary = function(userId, adviceId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId}, {fields:'_id', insert: true}),
		AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields:'advisor prohibited public subscribers'})])
	.then(([advisor, advice])  => {
		if(advisor && advice) {
			const advisorId = advisor._id;
			
			//PERSONAL or subscribers
			//get to see expanded portfolio if chosen
			return advice.advisor.equals(advisorId) || (advice.public == true && advice.prohibited == false)
				
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
			return Promise.all([
				PerformanceHelper.computeAllPerformanceSummary(advice.portfolio),
				PortfolioHelper.computePortfolioAnalytics(advice.portfolio)
			]);
		} else {
			APIError.throwJsonError({message: "Advice not found", errorCode:1102});
		}
	})
	.then(([performanceSummary, portfolioAnalytics]) => {

		var currentPeformanceSummary = performanceSummary.current ? performanceSummary.current : {};
		performanceSummary.current = Object.assign(currentPeformanceSummary, portfolioAnalytics);

		return performanceSummary;
	})
	.catch(err => {
		return {error: err.message};
	});
};

//RECALCULATE IS NOT USED - 23/03/2018
module.exports.getAdvicePerformanceSummary = function(adviceId, recalculate) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'performanceSummary'})
	.then(advice => {
		if (!advice.performanceSummary || recalculate) {
			return exports.computeAdvicePerformanceSummary(adviceId);
		} else {
			return advice.performanceSummary
		}
	})
};

module.exports.computeAdviceAnalytics = function(adviceId) {
	let subscribers;
	let followers;
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'subscribers followers adviceAnalytics'})
	.then(advice => {
		if (advice) {
			var analyticsLastTwoDays = advice.adviceAnalytics ? advice.adviceAnalytics.slice(-2) : [];
			var currentDate = DateHelper.getCurrentDate();

			var currentDayData = analyticsLastTwoDays.length > 1 ? analyticsLastTwoDays[1] : analyticsLastTwoDays.length > 0 ? analyticsLastTwoDays[0] : null;
			var lastDayData = analyticsLastTwoDays.length > 1 ? analyticsLastTwoDays[0] : null;

			var datePresent = false;
			if (currentDayData) {
				console.log(currentDayData);
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

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_advice", 
            						advice: advice,
            						lastAdvice: oldAdvice ? oldAdvice : "",
            						strictNetValue: strictNetValue ? strictNetValue : false});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			
        	if (data["error"] == "") {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error validating the advice", errorCode: 2101}));
		    }
	    });
    })
};

module.exports.updateAdviceAnalyticsAndPerformanceSummary = function(adviceId) {
	return Promise.all([
			exports.computeAdviceAnalytics(adviceId),
			exports.computeAdvicePerformanceSummary(adviceId)
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

