'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const PerformanceHelper = require('./Performance');
const AnalyticsHelper = require('./Analytics');
const ratingFields = require('../../constants').contestRatingFields;
const APIError = require('../../utils/error');
const contestRankingScale = require('../../constants').contestRankingScale;

function _updateArrayWithRankFromRating(array) {
    let rank = 1;

    return array.map((item, index) => {
        if (index > 0 && item.rating < array[index - 1].rating) {
            rank = index + 1;
        }
        
        item.rank = rank;
        
        return item;
    });
}

const calculateAdviceRating = (ratingObj, allAdviceAnalytics = null, ratingType='current', field='maxLoss') =>  {
    const items = Object.keys(ratingObj).map(ratingAdviceId => {
        if (allAdviceAnalytics !== null) {
            const advicePerformance = allAdviceAnalytics.filter(item => (item.advice).toString() === ratingAdviceId)[0];
            const metricValue = _.get(advicePerformance, `performance[${ratingType}][${field}]`, 0);

            return {advice: ratingAdviceId, rating: ratingObj[ratingAdviceId], metricValue};
        } else {
            return {advice: ratingAdviceId, rating: ratingObj[ratingAdviceId]};
        }
    });

    return _updateArrayWithRankFromRating(_.orderBy(items, ['rating'], ['desc']));
}

function _getAdviceAnalytics(contestAdviceIds) {
    return Promise.map(contestAdviceIds, adviceId => {
        let advice = adviceId;
        return PerformanceHelper.getAdvicePerformanceSummary(adviceId)
        .then(performance => {
            return {advice: advice, performance: performance};
        })
    });
}

module.exports.updateAnalytics = function(contestId) {
    return ContestModel.fetchContest({_id: contestId}, {fields:'advices', advices: {all: true}})
    .then(contest => {
        const activeAdvices = contest.advices.filter(advice => advice.active === true);
        var contestAdviceIds = activeAdvices.map(item => item.advice);
        const rankingDetail = {current: [], simulated: []};

        return _getAdviceAnalytics(contestAdviceIds)
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
                        
                        //The ratingField contains true or diff
                        const itemPerformance = _.get(item, `performance.${ratingField.field}`, null);
                        valueRatingField[key] = itemPerformance !== null ? ratingField.multiplier * itemPerformance : NaN;
                    });

                    return AnalyticsHelper._computeFractionalRanking(valueRatingField, 100.0)
                    .then(frs => {
                        rankingDetail[ratingType].push({
                            field: ratingField.outputField, 
                            data: calculateAdviceRating(frs, allAdviceAnalytics, ratingType, ratingField.field),
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

                    return AnalyticsHelper._computeFractionalRanking(totalRankings, contestRankingScale);
                })
            })
        })
        .then(([currentRanking, simulatedRanking]) => {
            const contestId = contest._id;
            const currentDate = DateHelper.getCurrentDate();
            var arr = calculateAdviceRating(currentRanking).map((item, index) => {
                return {adviceId: item.advice, rating: item.rating}
            });
            const currentRankingData = _updateArrayWithRankFromRating(arr);

            const simulatedRankingData = _updateArrayWithRankFromRating(calculateAdviceRating(simulatedRanking).map((item, index) => {
                return {adviceId: item.advice, rating: item.rating};
            }));
            return ContestModel.updateRating({_id: contestId}, currentRankingData, simulatedRankingData, currentDate, rankingDetail)
            .then(() => {
                const contestId = contest._id;
                return ContestModel.updateWinners({_id: contestId}, currentRankingData, currentDate);
            })
        })
    })
}

module.exports.updateAllAnalytics = () => {
    let contestIds;
    ContestModel.fetchContests({active: true}, {fields: '_id'})
    .then(({contests, count}) => {
        if (contests) {
            contestIds = contests.map(contest => contest._id);
            return Promise.mapSeries(contestIds, contestId => {
                exports.updateAnalytics(contestId);
            })
        } else {
            console.log("No contests found");
        }
    })
}

module.exports.getAdviceSummary = function(adviceId) {
    return ContestModel.fetchContests({'advices.advice': adviceId}, {fields: 'name active advices.latestRank advices.advice'})
    .then(({contests, count}) => {
    
        const nContests = [];
        contests.map(contest => {
            const requiredAdviceIndex = _.findIndex(contest.advices, adviceItem => (adviceItem.advice).toString() === adviceId);
            if (requiredAdviceIndex !== -1) {
                nContests.push({
                    name: contest.name,
                    _id: contest._id,
                    active: contest.active,
                    adviceSummary: contest.advices[requiredAdviceIndex]
                });
            }
        });
        
        return nContests;
       
    })
}