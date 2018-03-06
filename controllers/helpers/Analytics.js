/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:56:41
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-06 16:56:10
*/

const PerformanceModel = require('../../models/Marketplace/Performance');
const AdviceModel = require('../../models/Marketplace/Advice');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require('./index');
const PerformanceHelper = require('./Performance');

function _computePerformanceRating (performance) {
	//return PerformanceModel.fetchPerformance({portfolio: portfolioId})
	//.then(performance => {
		//WRITE RATING LOGIC HERE
		if (performance) {
			//Use Sharpe Ratio Fractional Rnking
			//Use Information Ratio Fractional Ranking
			//Use Calmar Ratio Fractional Ranking
			//Use Total Return Fractional Ranking
			//Use Inverse of Volatility Fractional Ranking
			//Use Tracking Error Fractional Ranking

			return 5.0;
		} else {
			return 5.0
			//APIError.throwJsonError({portfolioId: portfolioId, message: "Performance not available"});
		}
	//});
}

function _computeAggregateRating (adviceIds) {
	return Promise.map(adviceIds, function(adviceId) {
		return AdviceModel.fetchAdvice({_id: adviceId}, {fields:'portfolio analytics'}, {populate: 'portfolio'});
	})
	.then(advices => {
		if (advices) {
			//FIND a logic to combine all ratings
			return 0.5;
		} else {
			APIError.throwJsonError({message: "Advices not available while computing aggregate ratings"});
		}
	});
}

function _updateAdvisorAnalytics(advisorId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: '_id subscribers followers'}),
		AdviceModel.fetchAdvices({advisor: advisorId, deleted: false, public: true}, {fields:'_id'})])
	.then(([advisor, advices]) => {
		if(advisor && advices) {
			return _computeAggregateRating(advices)
			.then(rating => {
				return {
					date: HelperFunctions.getDate(new Date()),
					numFollowers: advisor.followers.filter(item => {return item.active == true;}).length,
					rating: rating,
					numAdvices: advices.length
				};
			});
		} else {
			if(!advisor) {
				APIError.throwJsonError({advisor: advisorId, message: "Advisor not found while updating analytics"});
			} else if(!advices) {
				APIError.throwJsonError({advisor: advisorId, message: "Null advices for advisor"});
			}
		}
	})
	.then(advisorAnalytics => {
		return AdvisorModel.updateAnalytics({_id: advisorId}, advisorAnalytics);
	});
}

function _updateAdviceAnalytics(adviceId) {
	let subscribers;
	let followers;
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio subscribers followers'})
	.then(advice => {
		if (advice) {
			subscribers = advice.subscribers;
			followers = advice.followers;
			return PerformanceHelper.getPerformanceSummary(advice.portfolio);
		} else {
			APIError.throwJsonError({advice: adviceId, message: "Advice not found while updating analytics"});
		}
	})
	.then(performance => {
		return Promise.all([performance, _computePerformanceRating(performance)])
	})
	.then(([performance, rating]) => {
		var updateObj = { 
			analytics: {
				date: HelperFunctions.getDate(new Date()),
				numSubscribers: subscribers.filter(item => {return item.active == true}).length,
				numFollowers: followers.filter(item => {return item.active == true}).length,
				rating: rating,
			},
			latestPerformance: performance
		};

		return updateObj;
	})
	.then(adviceAnalyticsAndPerformance => {
		return AdviceModel.updateAnalyticsAndPerformance({_id: adviceId}, adviceAnalyticsAndPerformance);
	});
}

module.exports.updateAllAdvisorAnalytics = function() {
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		if (advisors) {
			return Promise.map(advisors, function(advisor) {
				return _updateAdvisorAnalytics(advisor._id);
			});
		} else {
			APIError.throwJsonError({message: "Advisors not found while updating analytics"});
		}
	});
};

module.exports.updateAllAdviceAnalytics = function() {
	return AdviceModel.fetchAdvices({deleted: false}, {fields: '_id'})
	.then(advices => {
		if (advices) {
			return Promise.map(advices, function(advice) {
				return _updateAdviceAnalytics(advice._id);
			});
		} else {
			APIError.throwJsonError({message: "Advices not found while updating analytics"});
		}
	});
};
