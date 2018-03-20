/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:56:41
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-19 16:46:33
*/

const AdviceModel = require('../../models/Marketplace/Advice');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require('./index');
const AdviceHelper = require('./Advice');
const PerformanceHelper = require('./Performance');

function _computeAggregateRating (adviceIds) {
	return Promise.map(adviceIds, function(adviceId) {
		return AdviceModel.fetchAdvice({_id: adviceId}, {fields:'portfolio analytics'}, {populate: 'portfolio'});
	})
	.then(advices => {
		if (advices) {
			//FIND a logic to combine all ratings
			return 0.5;
		} else {
			APIError.throwJsonError({message: "No advices found", errorCode: 1118});
		}
	});
}

function _updateAdvisorAnalytics(advisorId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: '_id subscribers followers'}),
		AdviceModel.fetchAdvices({advisor: advisorId, deleted: false}, {fields:'_id'})
	])
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
				APIError.throwJsonError({advisor: advisorId, message: "Advisor not found", errorCode: 1201});
			} else if(!advices) {
				APIError.throwJsonError({advisor: advisorId, message: "No advices found", errorCode: 1118});
			}
		}
	})
	.then(advisorAnalytics => {
		return AdvisorModel.updateAnalytics({_id: advisorId}, advisorAnalytics);
	});
}

function _updateAdviceAnalytics(adviceId) {
	
	return Promise.all([
		AdviceHelper.getAdviceAnalytics(adviceId, true),
		AdviceHelper.getAdvicePerformanceSummary(adviceId, true)
	])
	.then(([adviceAnalytics, advicePerformanceSummary]) => {
		var rating = advicePerformanceSummary && advicePerformanceSummary.rating ? advicePerformanceSummary.rating : 0.0;
		return AdviceModel.updateAnalyticsAndPerformance({_id: adviceId}, {analytics: Object.assign({rating:rating}, adviceAnalytics), performance: advicePerformanceSummary});
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
			APIError.throwJsonError({message: "Advisors not found", errorCode:1208});
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
			APIError.throwJsonError({message: "No advices found", errorCode: 1118});
		}
	});
};
