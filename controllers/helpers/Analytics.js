/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:56:41
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-07-13 16:58:51
*/

const AdviceModel = require('../../models/Marketplace/Advice');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const WebSocket = require('ws'); 
const config = require('config');
const AdviceHelper = require('./Advice');
const PerformanceHelper = require('./Performance');
const DateHelper = require('../../utils/Date');
const WSHelper = require('./WSHelper');
const ratingFields = require('../../constants').adviceRatingFields;
const contestRankingScale = require('../../constants').adviceRankingScale;
const _ = require('lodash');


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

function _computeFractionalRanking(values, scale) {
	return new Promise((resolve, reject) => {
	 	var msg = JSON.stringify({action:"compute_fractional_ranking", 
            						values: values,
            						scale: scale ? scale : ""});
	 	WSHelper.handleMktRequest(msg, resolve, reject);

    });
}

function _updateAdvisorAnalytics(advisorId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: '_id subscribers followers'}),
		AdviceModel.fetchAdvices({advisor: advisorId, deleted: false}, {fields:'_id'})
	])
	.then(([advisor, [advices, ct]]) => {
		if(advisor && advices) {
			return _computeAggregateRating(advices)
			.then(rating => {
				return {
					date: DateHelper.getDate(),
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

function _updateAdviceAnalytics(adviceId) { // done
	
	//REPLACING GET TO CALCULATE - 23/03/2018
	//BECAUSE WE SHOULDN"T RELY OF STALE VALUE
	return Promise.all([
		AdviceHelper.computeAdviceAnalytics(adviceId),
		PerformanceHelper.computeAdvicePerformanceSummary(adviceId)
	])
	.then(([adviceAnalytics, advicePerformanceSummary]) => {
		return AdviceModel.updateAnalyticsAndPerformance({_id: adviceId}, {analytics: adviceAnalytics, performanceSummary: advicePerformanceSummary});
	});
}

module.exports.updateAllAdvisorAnalytics = function() {
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		if (advisors) {
			return Promise.mapSeries(advisors, function(advisor) {
				return _updateAdvisorAnalytics(advisor._id);
			});
		} else {
			APIError.throwJsonError({message: "Advisors not found", errorCode:1208});
		}
	});
};

module.exports.updateAllAdviceAnalytics = function() { // done
	
	let adviceIds;
	return AdviceModel.fetchAdvices({deleted: false}, {fields: '_id'})
	.then(([advices, ct]) => {
		if (advices) {
			adviceIds = advices.map(item => item._id);
			return Promise.mapSeries(advices, function(advice) {
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
		//2[Updated]: Fixed this benchmark issue by computing ranking of diff performance rather than true performance

		return Promise.map(ratingTypes, function(ratingType) {
			var allPerformances = allAdviceAnalytics.map(item => {return {advice: item._id, performance: item.performanceSummary[ratingType]}}); 
			
			return Promise.map(ratingFields, function(ratingField) {

				var valueRatingField = {};
				allPerformances.forEach(item => {
					var key = item.advice; 
					const itemPerformance = _.get(item, `performance.${ratingField.field}`, null);
                    valueRatingField[key] = itemPerformance !== null ? ratingField.multiplier * itemPerformance : NaN;
				});
				
				return _computeFractionalRanking(valueRatingField);

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

				return _computeFractionalRanking(totalRankings, 5.0);
			});
		})
		.then(([currentRatings, simulatedRatings])  => {
			return Promise.map(adviceIds, function(adviceId) {
				return AdviceModel.updateRating({_id: adviceId}, {date: DateHelper.getCurrentDate(), rating: {current: currentRatings[adviceId], simulated: simulatedRatings[adviceId]}});
			});
		});
	});
};

module.exports.updateAllAnalytics = function() { // done
	return exports.updateAllAdviceAnalytics()
	.then(updated => {
		return exports.updateAllAdvisorAnalytics();	
	})
	.catch(err => {
		console.log(err.message);
	});
}

module.exports._computeFractionalRanking = _computeFractionalRanking;
module.exports._computeAggregateRating = _computeAggregateRating;