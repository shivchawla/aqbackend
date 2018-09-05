'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const AdviceModel = require('../../models/Marketplace/Advice');
const UserModel = require('../../models/user');
const PerformanceHelper = require('./Performance');
const AdviceHelper = require('./Advice');
const SecurityHelper = require('./Security');
const AnalyticsHelper = require('./Analytics');
const ratingFields = require('../../constants').contestRatingFields;
const APIError = require('../../utils/error');
const contestRankingScale = require('../../constants').contestRankingScale;
const sendEmail = require('../../email');
const config = require('config');
const moment = require('moment-timezone');

function formatValue(value, options) {
    const outputVal = _.get(options, 'pct', false) ? `${(value*100).toFixed(2)}%` : value;
    if (_.get(options,'color', null)) {
        return value > 0 && !options.inverse ? `<span style="color:green">${outputVal}</span>` :
            Math.abs(value) > 0 ? `<span style="color:red">${outputVal}</span>` : outputVal;
    } else {
        return outputVal;
    }
};

const getAdviceRatingDetail = (rankingDetail, adviceId, type) => {
    return rankingDetail[type].map((fieldData, index) => {
        const {field, data} = fieldData;
        const adviceIndex = _.findIndex(data, item => item.advice === adviceId);
        
        return {
            field, 
            ratingValue: data[adviceIndex].rating, 
            rank: data[adviceIndex].rank, 
            metricValue: data[adviceIndex].metricValue
        };
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


function _updateRating(contestId, currentAdviceRankingData, simulatedAdviceRankingData, selectedDate, rankingDetail) {
    const today = DateHelper.getCurrentDate();
    return ContestModel.fetchContest({_id: contestId}, {advices: 1})
    .then(contest => {
        if (contest) {
            return Promise.map(contest.advices, adviceItem => {
                const currentAdviceIdx = _.findIndex(currentAdviceRankingData, adviceData => adviceData.adviceId === (adviceItem.advice).toString());
                const simulatedAdviceIdx = _.findIndex(simulatedAdviceRankingData, adviceData => adviceData.adviceId === (adviceItem.advice).toString());
                if (currentAdviceIdx > -1) {
                    const rank = _.get(currentAdviceRankingData, `[${currentAdviceIdx}].rank`, null);
                    const currentRatingValue = _.get(currentAdviceRankingData, `[${currentAdviceIdx}].rating`, null);
                    const simulatedRatingValue = _.get(simulatedAdviceRankingData, `[${simulatedAdviceIdx}].rating`, null);
                    const currentRatingRank = _.get(currentAdviceRankingData, `[${currentAdviceIdx}].rank`, null);
                    const simulatedRatingRank = _.get(simulatedAdviceRankingData, `[${simulatedAdviceIdx}].rank`, null);
                    // find if the date already exists in the rating array
                    const rankingIdx = _.findIndex(adviceItem.rankingHistory, rankData => {
                        const rankDate = rankData.date;
                        return DateHelper.compareDates(rankDate, selectedDate) === 0;
                    });
                    if (rankingIdx === -1) { // If date doesn't exist push it into the history
                        adviceItem.rankingHistory.push({
                            value: rank, 
                            date: selectedDate, 
                            rating: {
                                current: {
                                    value: currentRatingValue,
                                    rank: currentRatingRank,
                                    detail: getAdviceRatingDetail(rankingDetail, (adviceItem.advice).toString(), 'current')
                                },
                                simulated: {
                                    value: simulatedRatingValue,
                                    rank: simulatedRatingRank,
                                    detail: getAdviceRatingDetail(rankingDetail, (adviceItem.advice).toString(), 'simulated')
                                }
                            }
                        });
                    } else { // Modify the rank value
                        adviceItem.rankingHistory[rankingIdx].value = rank;
                        adviceItem.rankingHistory[rankingIdx].rating = {
                            current: {
                                value: currentRatingValue,
                                rank: currentRatingRank,
                                detail: getAdviceRatingDetail(rankingDetail, (adviceItem.advice).toString(), 'current')
                            },
                            simulated: {
                                value: simulatedRatingValue,
                                rank: simulatedRatingRank,
                                detail: getAdviceRatingDetail(rankingDetail, (adviceItem.advice).toString(), 'simulated')
                            }
                        };
                    }
                    // Only modify the latestRank if the date is today
                    if (DateHelper.compareDates(today, selectedDate) === 0){
                        adviceItem.latestRank = {
                            value: rank, 
                            selectedDate, 
                            rating: {
                                current: {
                                    value: currentRatingValue,
                                    rank: currentRatingRank,
                                    detail: getAdviceRatingDetail(rankingDetail, (adviceItem.advice).toString(), 'current')
                                },
                                simulated: {
                                    value: simulatedRatingValue,
                                    rank: simulatedRatingRank,
                                    detail: getAdviceRatingDetail(rankingDetail, (adviceItem.advice).toString(), 'simulated')
                                }
                            }
                        };
                    }
                }

                return adviceItem;
            })
            .then(updatedAdvices => {
                return ContestModel.updateContest({_id: contestId}, {advices: updatedAdvices});    
            });
            
        }
    });
}

function _updateWinners(contestId, currentAdviceRankingData, simulatedAdviceRankingData, date, rankingDetail) {
    return ContestModel.fetchContest({_id: contestId}, {fields:'winners rules endDate'})
    .then(contest => {
        let contestId = contest._id;
        let rawWinners = [];

        const numWinners = contest.rules.prize.length;
        const contestEndDate = contest.endDate;
        
        const hasEnded = DateHelper.compareDates(contestEndDate, date) == 0 ? true : false;
        if (hasEnded) {
            let i=0;
            while(rawWinners.length < numWinners*3) {
                const rankingData = currentAdviceRankingData[i++];

                const currentAdviceIdx = _.findIndex(currentAdviceRankingData, adviceData => adviceData.adviceId === (rankingData.adviceId).toString());
                const simulatedAdviceIdx = _.findIndex(simulatedAdviceRankingData, adviceData => adviceData.adviceId === (rankingData.adviceId).toString());
                const currentRatingValue = _.get(currentAdviceRankingData, `[${currentAdviceIdx}].rating`, null);
                const simulatedRatingValue = _.get(simulatedAdviceRankingData, `[${simulatedAdviceIdx}].rating`, null);
                const currentRatingRank = _.get(currentAdviceRankingData, `[${currentAdviceIdx}].rank`, null);
                const simulatedRatingRank = _.get(simulatedAdviceRankingData, `[${simulatedAdviceIdx}].rank`, null);
                     
                rawWinners.push({
                    advice: rankingData.adviceId,
                    rank: {
                        value: _.get(rankingData, 'rank', null), 
                        date, 
                        rating: {
                            current: {
                                value: currentRatingValue,
                                rank: currentRatingRank,
                                detail: getAdviceRatingDetail(rankingDetail, (rankingData.adviceId).toString(), 'current')
                            },
                            simulated: {
                                value: simulatedRatingValue,
                                rank: simulatedRatingRank,
                                detail: getAdviceRatingDetail(rankingDetail, (rankingData.adviceId).toString(), 'simulated')
                            }
                        }
                    },
                });
            } //While ends

            return Promise.map(rawWinners, function(winner) {
                return AdviceModel.fetchAdvice({_id: winner.advice}, {fields: 'advisor', populate: 'advisor'})
                .then(advice => {
                    winner.advice = advice.toObject();
                    return winner
                })
            })
            .then(updatedWinners => {
                var notAllowedUsers = config.get('winners_not_allowed');
                return _.uniqBy(
                    updatedWinners.filter(item => {
                        return notAllowedUsers.indexOf(
                            _.get(item,'advice.advisor.user.email', "")) ==-1
                        })
                        .map(item => {
                            item.advice.advisor = item.advice.advisor._id.toString(); 
                            return item;
                        })
                    , 'advice.advisor');
            })
            .then(uniqWinners => {
                let finalWinners = [];

                let i=1;
                let k=0;
                while(k < numWinners && i <= uniqWinners.length) {
                    var rankXWinners = uniqWinners.filter(item => item.rank.value == i);
                    var totalXWinners = rankXWinners.length;
                    var prizeXRankers = contest.rules.prize.slice(k, k+totalXWinners).map(item => item.value);

                    var totalPrizeMoney = _.sum(prizeXRankers);

                    if (totalXWinners > 0) {
                        var priceMoneyPerWinner = totalPrizeMoney/totalXWinners;
                        
                        for(var j=0; j<totalXWinners; j++) {
                            finalWinners[k+j] = Object.assign({prize: {value: priceMoneyPerWinner, rank: k+1}}, uniqWinners[k+j]);
                        }
                        
                        i += totalXWinners;
                        k += totalXWinners;

                    } else { 
                        i++;
                    }
                                           
                }

                return finalWinners;
            })
            .then(finalWinners => {
                finalWinners = finalWinners.map(item => {item.advice = item.advice._id.toString(); return item;});
                return ContestModel.updateContest({_id: contestId}, {winners: finalWinners, active: false});    
            });
        } else {
            return null;
        }
    })
}

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
    return ContestModel.fetchContest({_id: contestId}, {fields:'advices', advices: {all: true}}, )
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

                        return AnalyticsHelper._computeFractionalRanking(valueRatingField, ratingField.scale)
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
                const currentDate = DateHelper.getCurrentDate();
                var arr = calculateAdviceRating(currentRanking).map((item, index) => {
                    return {adviceId: item.advice, rating: item.rating}
                });
                const currentRankingData = _updateArrayWithRankFromRating(arr);
                const simulatedRankingData = _updateArrayWithRankFromRating(calculateAdviceRating(simulatedRanking).map((item, index) => {
                    return {adviceId: item.advice, rating: item.rating};
                }));
                
                return _updateRating(contestId, currentRankingData, simulatedRankingData, currentDate, rankingDetail)
                .then(() => {
                    var currentDatetimeIndia = moment.tz(new Date(), "Asia/Kolkata");
                    if (currentDatetimeIndia.get('hour') >= 16) {
                        return _updateWinners(contestId, currentRankingData, simulatedRankingData, currentDate, rankingDetail);
                    }
                });
            });
        } else {
            return contest;
        }
    });
};

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
};

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
};

module.exports.sendContestEntryDailyDigest = function() {
    let latestContestId;
    ContestModel.fetchContests({active: true, endDate: {$gt: DateHelper.getCurrentDate()}}, {fields: '_id'})
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
            return Promise.mapSeries(contestAdviceIds, function(adviceId) {
                return Promise.all([
                    PerformanceHelper.getAdvicePerformanceSummary(adviceId),
                    exports.getAdviceSummary(adviceId),
                    //P3   
                    AdviceHelper.getAdvicePortfolio(adviceId, {populateAvg: true})
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

            //Check if num periods > 1
            if (_.get(performance, 'current.period', 0) < 1) {
                return {}; 
            }

            const maxLoss = formatValue(_.get(performance, 'current.maxLoss', 0), {color:true, pct: true, inverse:true});
            const totalReturn = formatValue(_.get(performance, 'current.totalReturn', 0), {color: true, pct: true});
            const volatility = formatValue(_.get(performance, 'current.volatility', 0), {pct:true});
            const excessReturn = formatValue(_.get(performance, 'current.diff.totalReturn', 0), {color: true, pct:true});
            const trackingError = formatValue(_.get(performance, 'current.diff.volatility', 0), {pct:true});
            const information = formatValue(_.get(performance, 'current.diff.sharpe', 0));

            performanceDigest = Object.assign(performanceDigest, {totalReturn, volatility, excessReturn, trackingError, information,maxLoss});

            let j=1;

            let concerns="None";

            if (positions) {
                let sortedPositions = positions.sort((a,b) => {return a.latestDetail.changePct > b.latestDetail.changePct ? -1 : 1});

                sortedPositions.slice(0,3).concat(sortedPositions.slice(-3)).map(item => {
                    let position = _.pick(item, ['security.ticker', 'security.detail.NSE_ID', 'weightInPortfolio', 'lastPrice', 'latestDetail.changePct', 'latestDetail.current', 'unrealizedPnlPct']);
                    
                    if (position.weightInPortfolio > 0.125) {
                        var ticker = _.get(position,'security.detail.NSE_ID', null) || position.ticker,
                        concerns = `<span style="color:red;font-size:14px;">Weight in ${ticker} is greater than 12.5%</span>`;
                    }

                    performanceDigest = Object.assign({
                        [`ticker${j}`] : _.get(position,'security.detail.NSE_ID', null) || position.ticker,
                        [`weight${j}`]: formatValue(position.weightInPortfolio, {pct: true}),
                        [`totalPnl${j}`]: formatValue(position.unrealizedPnlPct, {color: true, pct: true}),
                        [`lastPrice${j}`]: (_.get(position, 'latestDetail.current', null) || position.lastPrice).toFixed(2),
                        [`dailyChg${j}`]: formatValue(_.get(position,'latestDetail.changePct', 0), {color: true, pct: true})
                    }, performanceDigest)

                    j++;

                });

                performanceDigest = Object.assign(performanceDigest, {concerns});
            }

            //Get advisor details and send email
            return AdviceModel.fetchAdvice({_id: adviceId}, {fields:'advisor', populate:'advisor'})
            .then (advice => {
                const user = _.get(advice, 'advisor.user', null);
                if (user) {
                    return UserModel.fetchUser({_id: user._id});
                } else {
                    console.log("No user found for advice");
                    return null;
                }
            })
            .then(user => {
                if (user) {
                    const code = user.code;
                    const type = "daily_performance_digest";
                    const email = user.email;
                    const sendDigest = _.get(user, 'emailpreference.daily_performance_digest', true);
                    
                    const unsubscribeUrl = eval('`'+config.get('request_unsubscribe_url') +'`');

                    performanceDigest = Object.assign(performanceDigest, {unsubscribeUrl});
                            
                    if (user && process.env.NODE_ENV === 'production') {
                        if (sendDigest) {
                            return sendEmail.sendPerformanceDigest(performanceDigest, user);
                        } else {
                            return {};
                        }
                    } else if(process.env.NODE_ENV === 'development') {
                        return sendEmail.sendPerformanceDigest(performanceDigest, 
                            {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
                    }
                } else {
                    return {};
                }    
            });

            i++;
        });
    })
    .catch(err => {
        console.log("Error while sending performance digest");
        console.log(err.message)
    })
};

module.exports.sendEmailToContestWinners = function() {
     
    let contestId, contestName;
    return ContestModel.fetchContest({active:false, endDate: {$eq: DateHelper.getCurrentDate()}}, {fields: '_id winners name'})
    .then(contest => {
        if (contest) {
            contestId = contest._id;
      
            const winners = contest.winners;
            const winnerAdviceIds = winners.map(item => item.advice.toString());

            return new Promise.mapSeries(winnerAdviceIds, function(adviceId) {
                
                const winner = winners.find(item => item.advice.toString() == adviceId);
                
                var winnerDigest = {contestName: contest.name,
                    contestRank: winner.rank.value,
                    prizeMoney: `Rs. ${winner.prize.value}`,
                    leaderboardUrl: `${config.get('hostname')}/contest/leaderboard/${contestId}`
                }; 

                //Get advisor details and send email
                return AdviceModel.fetchAdvice({_id: adviceId}, {fields:'advisor', populate:'advisor'})
                .then (advice => {
                    const user = _.get(advice, 'advisor.user', null);
                    if (user) {
                        return UserModel.fetchUser({_id: user._id});
                    } else {
                        console.log("No user found for advice");
                        return null;
                    }
                })
                .then(user => {
                    if (user) { 
                        if (user && process.env.NODE_ENV === 'production') {
                            if (sendDigest) {
                                return sendEmail.sendContestWinnerEmail(winnerDigest, user);
                            } else {
                                return {};
                            }
                        } else if(process.env.NODE_ENV === 'development') {
                            console.log("FCUK");
                            return {};
                            return sendEmail.sendContestWinnerEmail(winnerDigest, 
                                {email:"shivchawla2001@gmail.com", firstName: "Shiv", lastName: "Chawla"});
                        }
                    } else {
                        return {};
                    }    
                });
            }); 
        } else {
            APIError.throwJsonError({message: "No contests found"});
        }        
    });
};

module.exports.updateWinnerPortfolio = function() {

    //Step 1. Find the earliest active contest
    //Step 2. Find the top the entries
    //Step 3. Combine them
    //Step 4. Create/update the winner portfolio with 3
};