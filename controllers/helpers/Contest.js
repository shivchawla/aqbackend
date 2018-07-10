'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const PerformanceHelper = require('./Performance');
const AnalyticsHelper = require('./Analytics');

const calculateAdviceRanking = (ranking, allAdviceAnalytics = null, ratingType='current', field='maxLoss') =>  {
    const items = Object.keys(ranking).map(rank => {
        if (allAdviceAnalytics !== null) {
            const advicePerformance = allAdviceAnalytics.filter(item => (item.advice).toString() === rank)[0];
            const metricValue = _.get(advicePerformance, `performance[${ratingType}].diff[${field}]`, 0);

            return {advice: rank, rating: ranking[rank], metricValue}
        } else {
            return {advice: rank, rating: ranking[rank]}
        }
    });

    return _.orderBy(items, ['rating'], ['desc'])
}

module.exports.updateAllAnalytics = () => {
    let contestIds, contestAdviceIds;
    var ratingFields = [
        {field:"maxLoss", multiplier:-1}, 
        {field:"sharpe", multiplier:1}, 
        {field:"annualReturn", multiplier:1}, 
        {field:"volatility", multiplier:-1}, 
        {field:"calmar", multiplier:1}, 
        {field:"alpha", multiplier:1}
    ];
    ContestModel.fetchContests({}, {fields: '_id advices'})
    .then(({contests, count}) => {
        if (contests) {
            contestIds = contests.map(contest => contest._id);
            return Promise.mapSeries(contests, contest => {
                contestAdviceIds = contest.advices.map(advice => advice.advice);
                const allFrsData = {current: [], simulated: []};

                return Promise.map(contestAdviceIds, adviceId => {
                    let advice = adviceId;
                    return PerformanceHelper.getAdvicePerformanceSummary(adviceId)
                    .then(performance => {
                        return {advice: advice, performance: performance};
                    })
                })
                .then(allAdviceAnalytics => {
                    var ratingTypes = ["current", "simulated"];

                    return Promise.map(ratingTypes, function(ratingType) {
                        var allPerformances = allAdviceAnalytics.map((item, index) => {
                            return {advice: contestAdviceIds[index], performance: item.performance[ratingType]}
                        }); 
            
                        return Promise.map(ratingFields, function(ratingField) {
                            var valueRatingField = {};
                            allPerformances.forEach(item => {
                                var key = item.advice; 
                                // valueRatingField[key] = item[`ratingType`] && item[ratingType].diff && item[ratingType].diff[ratingField.field] ?  ratingField.multiplier * item[ratingType].diff[ratingField.field] : NaN ;
                                valueRatingField[key] = item.performance && item.performance.diff && item.performance.diff[ratingField.field] ?  ratingField.multiplier * item.performance.diff[ratingField.field] : NaN ;
                            });

                            return AnalyticsHelper._computeFractionalRanking(valueRatingField)
                            .then(frs => {
                                allFrsData[ratingType].push({
                                    field: ratingField.field, 
                                    data: calculateAdviceRanking(frs, allAdviceAnalytics, ratingType, ratingField.field),
                                });

                                return frs;
                            })
                        })
                        .then(allFrs => {
                            var totalRankings = {};
                            contestAdviceIds.forEach(adviceId => {
                                let sum = 0.0
                                allFrs.forEach(rankings => {
                                    sum += rankings[adviceId];
                                });
            
                                totalRankings[adviceId] = sum;
                            });

                            return AnalyticsHelper._computeFractionalRanking(totalRankings, 5.0)
                        })
                    })
                })
                .then(([currentRanking, simulatedRanking]) => {
                    const contestId = contest._id;
                    const currentDate = DateHelper.getCurrentDate();
                    const currentRankingData = calculateAdviceRanking(currentRanking).map((item, index) => {
                        return {adviceId: item.advice, value: index + 1, rating: item.rating};
                    });
                    const simulatedRankingData = calculateAdviceRanking(simulatedRanking).map((item, index) => {
                        return {adviceId: item.advice, value: index + 1, rating: item.rating};
                    });
                    return ContestModel.updateRating({_id: contestId}, currentRankingData, simulatedRankingData, currentDate, allFrsData)
                    .then(() => {
                        const contestId = contest._id;
                        return ContestModel.updateWinners({_id: contestId}, currentRankingData, currentDate);
                    })
                })
            })
        }
    })
}