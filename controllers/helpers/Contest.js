'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const AdviceModel = require('../../models/Marketplace/Advice');
const PerformanceHelper = require('./Performance');
const PortfolioHelper = require('./Portfolio');
const SecurityHelper = require('./Security');
const AnalyticsHelper = require('./Analytics');
const ratingFields = require('../../constants').contestRatingFields;
const APIError = require('../../utils/error');
const contestRankingScale = require('../../constants').contestRankingScale;
const sendEmail = require('../../email');
const config = require('config');

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

        if (activeAdvices.length > 0) {
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
                            valueRatingField[key] = (_.get(item, `performance.${ratingField.field}`, ratingField.default) || ratingField.default) * ratingField.multiplier;
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
        } else {
            return contest;
        }
    });
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
    return ContestModel.fetchContests({'advices.advice': adviceId}, {fields: 'name active endDate advices.latestRank advices.advice advices.active advices.withDrawn advices.prohibited'})
    .then(({contests, count}) => {
        const nContests = [];
        contests.map(contest => {

            const requiredAdviceIndex = _.findIndex(contest.advices, adviceItem => (adviceItem.advice).toString() === adviceId);
            if (requiredAdviceIndex !== -1) {
                nContests.push({
                    name: contest.name,
                    _id: contest._id,
                    active: contest.active,
                    endDate: contest.endDate,
                    adviceSummary: contest.advices[requiredAdviceIndex]
                });
            }
        });
        
        return nContests;
       
    });
}

module.exports.sendContestEntryDailyDigest = function() {
    let latestContestId;
    ContestModel.fetchContests({active: true, endDate: {$gt: DateHelper.getCurrentDate()}}, {fields: '_id endDate'})
    .then(({contests, count}) => {
        if (contests && count > 0) {
            latestContestId = contests.sort((a,b) => {return a > b ? -1 : 1}).map(item => item._id)[0];
            
            if (latestContestId) {
                return exports.updateAnalytics(latestContestId);
            } else {
                APIError.jsonError({message: "No contest found"});
            }

        } else {
            APIError.jsonError({message: "No contests found"});
        }
    })
    .then(() => {
        return ContestModel.fetchContest({_id: latestContestId}, {fields:'advices', advices: {all: true}})
    })
    .then(contest => {
        const activeAdvices = contest.advices.filter(advice => advice.active === true);
        var contestAdviceIds = activeAdvices.map(item => item.advice.toString());

        if (activeAdvices.length > 0) {
            return Promise.map(contestAdviceIds, function(adviceId) {
                return Promise.all([
                    PerformanceHelper.getAdvicePerformanceSummary(adviceId),
                    exports.getAdviceSummary(adviceId),
                    //P3   
                    PortfolioHelper.getAdvicePortfolio(adviceId, {populateAvg: true})
                    .then(portfolio => {
                        return Promise.map(portfolio.detail.positions, function(item) {
                            return SecurityHelper.getStockLatestDetail({ticker: item.security.ticker}, "RT")
                            .then(latestPrice => {
                                return Object.assign(latestPrice, item);
                            });
                        });        
                    }) //P3
                ])
                .then(([performance, adviceSummaryContest, positions]) => {
                    return {advice: adviceId, positions, performance, adviceSummaryContest};
                })

            });
        } else {
            APIError.jsonError({message:"No active advices found"});
        }
    })
    .then(allAdviceInfo => {
        let i = 1;
        return Promise.map(allAdviceInfo, function(item) {
            var adviceId = item.advice;
            var performance = item.performance;
            var positions = item.positions;
            var adviceSummaryContest = item.adviceSummaryContest.filter(contestItem => contestItem.active == true);

            var allActiveRanks = adviceSummaryContest.map(item => {return {name: item.name , endDate: item.endDate, rank: item.adviceSummary.latestRank.value}}).sort((a,b) => {return DateHelper.compareDates(a.endDate, b.endDate) == 1 ? -1 : 1});

            var latestRank =  allActiveRanks.length > 0 ? allActiveRanks[0] : {};

            var performanceDigest = {
                contestEntryUrl: `${config.get('hostname')}/contest/entry/${adviceId}`,
                updateContestEntryUrl: `${config.get('hostname')}/contest/updateentry/${adviceId}`,
                leaderboardUrl: `${config.get('hostname')}/contest/leaderboard`,
            };
            
            performanceDigest = Object.assign(performanceDigest, {numContests: allActiveRanks.length, contestName: _.get(latestRank, 'name', "-"), rank: _.get(latestRank, 'rank', "-")});

            const maxLoss = formatValue(_.get(performance, 'current.maxLoss', 0), {color:true, pct: true, inverse:true});
            const totalReturn = formatValue(_.get(performance, 'current.totalReturn', 0), {color: true, pct: true});
            const volatility = formatValue(_.get(performance, 'current.volatility', 0), {pct:true});
            const excessReturn = formatValue(_.get(performance, 'current.diff.totalReturn', 0), {color: true, pct:true});
            const trackingError = formatValue(_.get(performance, 'current.diff.volatility', 0), {pct:true});
            const information = formatValue(_.get(performance, 'current.diff.sharpe', 0));

            performanceDigest = Object.assign(performanceDigest, {totalReturn, volatility, excessReturn, trackingError, information,maxLoss});

            let j=1
            if (positions) {
                let sortedPositions = positions.sort((a,b) => {return a.latestDetail.changePct > b.latestDetail.changePct ? -1 : 1});

                sortedPositions.slice(0,3).concat(sortedPositions.slice(-3)).map(item => {
                    let position = _.pick(item, ['security.ticker', 'security.detail.NSE_ID', 'weightInPortfolio', 'lastPrice', 'latestDetail.changePct', 'latestDetail.current', 'unrealizedPnlPct']);
                    
                    performanceDigest = Object.assign({
                        [`ticker${j}`] : position.security.detail.NSE_ID || position.ticker,
                        [`weight${j}`]: formatValue(position.weightInPortfolio, {pct: true}),
                        [`totalPnl${j}`]: formatValue(position.unrealizedPnlPct, {color: true, pct: true}),
                        [`lastPrice${j}`]: (position.latestDetail.current || position.lastPrice).toFixed(2),
                        [`dailyChg${j}`]: formatValue(position.latestDetail.changePct, {color: true, pct: true})
                    }, performanceDigest)

                    j++;

                });
            }

            //Get advisor details and send email
            AdviceModel.fetchAdvice({_id: adviceId}, {fields:'advisor', populate:'advisor'})
            .then(advice => {
                const user = _.get(advice, 'advisor.user', null);
                
                if (user && process.env.NODE_ENV === 'production') {
                    return sendEmail.sendPerformanceDigest(performanceDigest, user);
                } else if(process.env.NODE_ENV === 'development' && i == 1) {
                    return sendEmail.sendPerformanceDigest(performanceDigest, 
                        {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
                }    
            })

            i++;
        });
    })
    .catch(err => {
        console.log("Error while sending performance digest");
        console.log(err.message)
    })
}

function formatValue(value, options) {
    const outputVal = _.get(options, 'pct', false) ? `${(value*100).toFixed(2)}%` : value;
    if (_.get(options,'color', null)) {
        return value > 0 && !options.inverse ? `<span style="color:green">${outputVal}</span>` :
            Math.abs(value) > 0 ? `<span style="color:red">${outputVal}</span>` : outputVal;
    } else {
        return outputVal;
    }
}