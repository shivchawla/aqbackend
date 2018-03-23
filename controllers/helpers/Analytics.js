/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:56:41
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-23 19:11:56
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
		return AdviceModel.fetchAdvice({_id: adviceId}, {fields:'rating'});
	})
	.then(advices => {
		if (advices) {
			//FIND a logic to combine all ratings
			var sumCurrent = 0.0;
			var denomCurrent = 0;

			var sumSim = 0.0;
			var denomSim = 0;
			advices.forEach(item => {
				if(item.rating && item.rating.current) {
					sumCurrent += item.rating.current;
					denomCurrent += 1;
				}

				if(item.rating && item.rating.simulated) {
					sumSim += item.rating.simulated;
					denomSim += 1;
				}
			});

			return {current: denomCurrent > 0 ? sumCurrent/denomCurrent : 0.0, 
					simulated: denomSim > 0 ? sumSim/denomSim : 0.0};

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
	
	//REPLACING GET TO CALCULATE - 23/03/2018
	//BECAUSE WE SHOULDN"T RELY OF STALE VALUE
	return Promise.all([
		AdviceHelper.computeAdviceAnalytics(adviceId, true),
		AdviceHelper.computeAdvicePerformanceSummary(adviceId, true)
	])
	.then(([adviceAnalytics, advicePerformanceSummary]) => {
		return AdviceModel.updateAnalyticsAndPerformance({_id: adviceId}, {analytics: adviceAnalytics, performanceSummary: advicePerformanceSummary});
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
	
	let adviceIds;
	return AdviceModel.fetchAdvices({deleted: false}, {fields: '_id'})
	.then(advices => {
		if (advices) {
			adviceIds = advices.map(item => item._id);
			return Promise.map(advices, function(advice) {
				return _updateAdviceAnalytics(advice._id);
			});
		} else {
			APIError.throwJsonError({message: "No advices found", errorCode: 1118});
		}
	})
	.then(allAdviceAnalytics => {
		var ratingTypes = ["current", "simulated"];

		//NEXT STEPS: 1. Group by benchmarks
		//2. Scale Ranking by benchmark performance (benchmark = 0.5 (scale of 1.0))

		return Promise.map(ratingTypes, function(ratingType) {
			var allPerformances = allAdviceAnalytics.map(item => {return {advice: item._id, performance: item.performanceSummary[ratingType]}}); 
			var ratingFields = [{field:"maxLoss", multiplier:-1}, {field:"sharpe", multiplier:1}, {field:"annualReturn", multiplier:1}, {field:"information", multiplier:1}, {field:"volatility", multiplier:-1}, {field:"calmar", multiplier:1}, {field:"alpha", multiplier:1}];

			return Promise.map(ratingFields, function(ratingField){

				var valueRatingField = {};
				allPerformances.forEach(item => {
					var key = item.advice; 
					valueRatingField[key] = item.performance && item.performance[ratingField.field] ?  ratingField.multiplier * item.performance[ratingField.field] : NaN ;
				});
				
				return HelperFunctions.computeFractionalRanking(valueRatingField);

			})
			.then(allFrs => {
				var totalRankings = {};
				adviceIds.forEach(adviceId => {
					sum = 0.0
					allFrs.forEach(rankings => {
						sum += rankings[adviceId];
					});

					totalRankings[adviceId] = sum;
				});

				return HelperFunctions.computeFractionalRanking(totalRankings, 5.0);
			});
		})
		.then(([currentRatings, simulatedRatings])  => {
			return Promise.map(adviceIds, function(adviceId) {
				return AdviceModel.updateRating({_id: adviceId}, {date: HelperFunctions.getDate(new Date()), rating: {current: currentRatings[adviceId], simulated: simulatedRatings[adviceId]}});
			});
		});
	});
};
