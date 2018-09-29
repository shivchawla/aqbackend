'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');
const ContestModel = require('../../models/Marketplace/Contest');
const ContestEntryModel = require('../../models/Marketplace/ContestEntry');
const UserModel = require('../../models/user');
const PerformanceHelper = require('./Performance');
const ContestContestEntryHelper = require('./ContestEntry');
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

const getEntryRatingDetail = (rankingDetail, entryId, type) => {
    return rankingDetail[type].map((fieldData, index) => {
        const {field, data} = fieldData;
        const entryIndex = _.findIndex(data, item => item.entry === entryId);
        
        return {
            field, 
            ratingValue: data[entryIndex].rating, 
            rank: data[entryIndex].rank, 
            metricValue: data[entryIndex].metricValue
        };
    });
}

const calculateEntryRating = (ratingObj, allEntryAnalytics = null, ratingType='current', field='maxLoss') =>  {
    const items = Object.keys(ratingObj).map(ratingEntryId => {
        if (allEntryAnalytics !== null) {
            const entryPerformance = allEntryAnalytics.filter(item => (item.entry).toString() === ratingEntryId)[0];
            const metricValue = _.get(entryPerformance, `performance[${ratingType}][${field}]`, 0);

            return {entry: ratingEntryId, rating: ratingObj[ratingEntryId], metricValue};
        } else {
            return {entry: ratingEntryId, rating: ratingObj[ratingEntryId]};
        }
    });

    return _updateArrayWithRankFromRating(_.orderBy(items, ['rating'], ['desc']));
}

function _updateRating(contestId, currentEntryRankingData, simulatedEntryRankingData, selectedDate, rankingDetail) {
    const today = DateHelper.getCurrentDate();
    return ContestModel.fetchContest({_id: contestId}, {entries: 1})
    .then(contest => {
        if (contest) {
            return Promise.map(contest.entries, entryItem => {
                const currentEntryIdx = _.findIndex(currentEntryRankingData, entryData => entryData.entryId === (entryItem.entry).toString());
                const simulatedEntryIdx = _.findIndex(simulatedEntryRankingData, entryData => entryData.entryId === (entryItem.entry).toString());
                if (currentEntryIdx > -1) {
                    const rank = _.get(currentEntryRankingData, `[${currentEntryIdx}].rank`, null);
                    const currentRatingValue = _.get(currentEntryRankingData, `[${currentEntryIdx}].rating`, null);
                    const simulatedRatingValue = _.get(simulatedEntryRankingData, `[${simulatedEntryIdx}].rating`, null);
                    const currentRatingRank = _.get(currentEntryRankingData, `[${currentEntryIdx}].rank`, null);
                    const simulatedRatingRank = _.get(simulatedEntryRankingData, `[${simulatedEntryIdx}].rank`, null);
                    // find if the date already exists in the rating array
                    const rankingIdx = _.findIndex(entryItem.rankingHistory, rankData => {
                        const rankDate = rankData.date;
                        return DateHelper.compareDates(rankDate, selectedDate) === 0;
                    });
                    if (rankingIdx === -1) { // If date doesn't exist push it into the history
                        entryItem.rankingHistory.push({
                            value: rank, 
                            date: selectedDate, 
                            rating: {
                                current: {
                                    value: currentRatingValue,
                                    rank: currentRatingRank,
                                    detail: getEntryRatingDetail(rankingDetail, (entryItem.entry).toString(), 'current')
                                },
                                simulated: {
                                    value: simulatedRatingValue,
                                    rank: simulatedRatingRank,
                                    detail: getEntryRatingDetail(rankingDetail, (entryItem.entry).toString(), 'simulated')
                                }
                            }
                        });
                    } else { // Modify the rank value
                        entryItem.rankingHistory[rankingIdx].value = rank;
                        entryItem.rankingHistory[rankingIdx].rating = {
                            current: {
                                value: currentRatingValue,
                                rank: currentRatingRank,
                                detail: getEntryRatingDetail(rankingDetail, (entryItem.entry).toString(), 'current')
                            },
                            simulated: {
                                value: simulatedRatingValue,
                                rank: simulatedRatingRank,
                                detail: getEntryRatingDetail(rankingDetail, (entryItem.entry).toString(), 'simulated')
                            }
                        };
                    }
                    // Only modify the latestRank if the date is today
                    if (DateHelper.compareDates(today, selectedDate) === 0){
                        entryItem.latestRank = {
                            value: rank, 
                            selectedDate, 
                            rating: {
                                current: {
                                    value: currentRatingValue,
                                    rank: currentRatingRank,
                                    detail: getEntryRatingDetail(rankingDetail, (entryItem.entry).toString(), 'current')
                                },
                                simulated: {
                                    value: simulatedRatingValue,
                                    rank: simulatedRatingRank,
                                    detail: getEntryRatingDetail(rankingDetail, (entryItem.entry).toString(), 'simulated')
                                }
                            }
                        };
                    }
                }

                return entryItem;
            })
            .then(updatedEntries => {
                return ContestModel.updateContest({_id: contestId}, {entries: updatedEntries});    
            });
            
        }
    });
}

function _updateWinners(contestId, currentEntryRankingData, simulatedEntryRankingData, date, rankingDetail) {
    return ContestModel.fetchContest({_id: contestId}, {fields:'winners rules endDate'})
    .then(contest => {
        let contestId = contest._id;
        let rawWinners = [];

        const numWinners = contest.rules.prize.length;
        const contestEndDate = contest.endDate;
        
        const hasEnded = DateHelper.compareDates(contestEndDate, date) == 0 ? true : false;
        if (hasEnded) {
            let i=0;
            while(rawWinners.length < numWinners*3 && i < currentEntryRankingData.length) {
                const rankingData = currentEntryRankingData[i++];
                const currentEntryIdx = _.findIndex(currentEntryRankingData, entryData => entryData.entryId === (rankingData.entryId).toString());
                const simulatedEntryIdx = _.findIndex(simulatedEntryRankingData, entryData => entryData.entryId === (rankingData.entryId).toString());
                const currentRatingValue = _.get(currentEntryRankingData, `[${currentEntryIdx}].rating`, null);
                const simulatedRatingValue = _.get(simulatedEntryRankingData, `[${simulatedEntryIdx}].rating`, null);
                const currentRatingRank = _.get(currentEntryRankingData, `[${currentEntryIdx}].rank`, null);
                const simulatedRatingRank = _.get(simulatedEntryRankingData, `[${simulatedEntryIdx}].rank`, null);
                
                var currentDetail = getEntryRatingDetail(rankingDetail, (rankingData.entryId).toString(), 'current');  

                var totalReturnIdx = currentDetail.findIndex(item => {return item.field == "totalReturn";});
                let totalReturn = Infinity;

                if (totalReturnIdx != -1) {
                    totalReturn = currentDetail[totalReturnIdx].metricValue;
                }

                if (totalReturn > 0) {
                    rawWinners.push({
                        entry: rankingData.entryId,
                        rank: {
                            value: _.get(rankingData, 'rank', null), 
                            date, 
                            rating: {
                                current: {
                                    value: currentRatingValue,
                                    rank: currentRatingRank,
                                    detail: currentDetail
                                },
                                simulated: {
                                    value: simulatedRatingValue,
                                    rank: simulatedRatingRank,
                                    detail: getEntryRatingDetail(rankingDetail, (rankingData.entryId).toString(), 'simulated')
                                }
                            }
                        },
                    });
                }
            } //While ends

            return Promise.map(rawWinners, function(winner) {
                return EntryModel.fetchEntry({_id: winner.entry}, {fields: 'advisor', populate: 'advisor'})
                .then(entry => {
                    winner.entry = entry.toObject();
                    return winner
                })
            })
            .then(updatedWinners => {
                var notAllowedUsers = config.get('winners_not_allowed');
                return _.uniqBy(
                    updatedWinners.filter(item => {
                        return notAllowedUsers.indexOf(
                            _.get(item,'entry.advisor.user.email', "")) ==-1
                        })
                        .map(item => {
                            item.entry.advisor = item.entry.advisor._id.toString(); 
                            return item;
                        })
                    , 'entry.advisor');
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
                finalWinners = finalWinners.map(item => {item.entry = item.entry._id.toString(); return item;});
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

function _getContestEntryAnalytics(contestEntryIds) {
    return Promise.map(contestEntryIds, entryId => {
        return PerformanceHelper.getContestEntryPerformanceSummary(entryId)
        .then(performance => {
            return {entry: entryId, performance: performance};
        })
    });
}

function _getContestEntryAnalytics_Single(contestEntryId) {
    return PerformanceHelper.getContestEntryPerformanceSummary(entryId)
    .then(performance => {
        return {entry: entry, performance: performance};
    })
}

/*
*   Helper function to compute fractional ranks based on analytics
*/
function _computeRank(allEntryAnalytics, ratingType) {
     
    var allPerformances = allEntryAnalytics.map((item, index) => {
        return {entry: item.entry, performance: item.performance[ratingType]}
    }); 

    return Promise.map(ratingFields, function(ratingField) {
        var valueRatingField = {};
        allPerformances.forEach(item => {
            var key = item.entry; 
            
            //The ratingField contains true or diff
            valueRatingField[key] = (_.get(item, `performance.${ratingField.field}`, ratingField.default) || ratingField.default) * ratingField.multiplier;
        });

        return AnalyticsHelper._computeFractionalRanking(valueRatingField, ratingField.scale)
        .then(frs => {
            rankingDetail[ratingType].push({
                field: ratingField.outputField, 
                data: calculateEntryRating(frs, allEntryAnalytics, ratingType, ratingField.field),
            });

            return frs;
        })
    })
    .then(allFrs => {
        var totalRankings = {};
        contestEntryIds.forEach(entryId => {
            let sum = 0.0
            allFrs.forEach(rankings => {
                sum += rankings[entryId];
            });

            totalRankings[entryId] = sum;
        });

        return AnalyticsHelper._computeFractionalRanking(totalRankings, contestRankingScale);
    })
}

/*
* Update analytics for particular contest
*/
module.exports.updateAnalytics = function(contestId) {
    return ContestModel.fetchContest({_id: contestId}, {fields:'entries', entries: {all: true}}, )
    .then(contest => {
        const activeEntries = contest.entries.filter(entry => entry.active === true);
        var contestEntryIds = activeEntries.map(item => item.entry);
        const rankingDetail = {current: [], simulated: []};

        if (activeEntries.length > 0) {
            return _getContestEntryAnalytics(contestEntryIds)
            .then(allEntryAnalytics => {
                var ratingTypes = ["current", "simulated"];
                return Promise.map(ratingTypes, function(ratingType) {
                    return _computeRank(allEntryAnalytics, ratingType);
                })
            })
            .then(([currentRanking, simulatedRanking]) => {
                const currentDate = DateHelper.getCurrentDate();
                var arr = calculateEntryRating(currentRanking).map((item, index) => {
                    return {entryId: item.entry, rating: item.rating}
                });
                const currentRankingData = _updateArrayWithRankFromRating(arr);
                const simulatedRankingData = _updateArrayWithRankFromRating(calculateEntryRating(simulatedRanking).map((item, index) => {
                    return {entryId: item.entry, rating: item.rating};
                }));
                
                return _updateRating(contestId, currentRankingData, simulatedRankingData, currentDate, rankingDetail)
                .then(() => {
                    var currentDatetimeIndia = DateHelper.getCurrentIndiaDateTime();
                    if (currentDatetimeIndia.get('hour') >= 16) {
                        return _updateWinners(contestId, currentRankingData, simulatedRankingData, currentDate, rankingDetail);
                    }
                });
            });
        } else {
            return contest;
        }
    })
    .catch(err => {
        console.log(err);
    })
};

/*
* Update analytics for all contests 
*/
module.exports.updateAllAnalytics = () => {
    let contestIds;
    ContestModel.fetchContests({active: true}, {fields: '_id'})
    .then(([contests, count]) => {
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

module.exports.getContestEntrySummary = function(entryId) {
    return ContestModel.fetchContests({'entries.entry': entryId}, {fields: 'name active endDate entries.latestRank entries.entry entries.active entries.withDrawn entries.prohibited'})
    .then(([contests, count]) => {
        const nContests = [];
        contests.map(contest => {

            const requiredEntryIndex = _.findIndex(contest.entries, entryItem => (entryItem.entry).toString() === entryId);
            if (requiredEntryIndex !== -1) {
                nContests.push({
                    name: contest.name,
                    _id: contest._id,
                    active: contest.active,
                    endDate: contest.endDate,
                    entrySummary: contest.entries[requiredEntryIndex]
                });
            }
        });
        
        return nContests;
       
    });
};

module.exports.sendContestEntryDailyDigest = function() {
    let latestContestId;
    ContestModel.fetchContests({active: true, endDate: {$gt: DateHelper.getCurrentDate()}}, {fields: '_id'})
    .then(([contests, count]) => {
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
        return ContestModel.fetchContest({_id: latestContestId}, {fields:'entries', entries: {all: true}})
    })
    .then(contest => {
        const activeEntries = contest.entries.filter(entry => entry.active === true);
        var contestEntryIds = activeEntries.map(item => item.entry.toString());

        if (activeEntries.length > 0) {
            return Promise.mapSeries(contestEntryIds, function(entryId) {
                return Promise.all([
                    PerformanceHelper.getContestEntryPerformanceSummary(entryId),
                    exports.getEntrySummary(entryId),
                    //P3   
                    ContestEntryHelper.getContestEntryPortfolio(entryId, {populateAvg: true})
                    .then(portfolio => {
                        return Promise.map(portfolio.detail.positions, function(item) {
                            return SecurityHelper.getStockLatestDetail({ticker: item.security.ticker}, "RT")
                            .then(latestPrice => {
                                return Object.assign(latestPrice, item);
                            });
                        });        
                    }) //P3
                ])
                .then(([performance, entrySummaryContest, positions]) => {
                    return {entry: entryId, positions, performance, entrySummaryContest};
                })

            });
        } else {
            APIError.jsonError({message:"No active entries found"});
        }
    })
    .then(allEntryInfo => {
        let i = 1;
        return Promise.map(allEntryInfo, function(item) {
            var entryId = item.entry;
            var performance = item.performance;
            var positions = item.positions;
            var entrySummaryContest = item.entrySummaryContest.filter(contestItem => contestItem.active == true);

            var allActiveRanks = entrySummaryContest.map(item => {return {name: item.name , endDate: item.endDate, rank: item.entrySummary.latestRank.value}}).sort((a,b) => {return DateHelper.compareDates(a.endDate, b.endDate) == 1 ? -1 : 1});

            var latestRank =  allActiveRanks.length > 0 ? allActiveRanks[0] : {};

            var performanceDigest = {
                contestEntryUrl: `${config.get('hostname')}/contest/entry/${entryId}`,
                updateContestEntryUrl: `${config.get('hostname')}/contest/updateentry/${entryId}`,
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
            return EntryModel.fetchEntry({_id: entryId}, {fields:'advisor', populate:'advisor'})
            .then (entry => {
                const user = _.get(entry, 'advisor.user', null);
                if (user) {
                    return UserModel.fetchUser({_id: user._id});
                } else {
                    console.log("No user found for entry");
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
            const winnerEntryIds = winners.map(item => item.entry.toString());

            return new Promise.mapSeries(winnerEntryIds, function(entryId) {
                
                const winner = winners.find(item => item.entry.toString() == entryId);
                
                var winnerDigest = {contestName: contest.name,
                    contestRank: winner.rank.value,
                    prizeMoney: `Rs. ${winner.prize.value}`,
                    leaderboardUrl: `${config.get('hostname')}/contest/leaderboard/${contestId}`
                }; 

                //Get advisor details and send email
                return EntryModel.fetchEntry({_id: entryId}, {fields:'advisor', populate:'advisor'})
                .then (entry => {
                    const user = _.get(entry, 'advisor.user', null);
                    if (user) {
                        return UserModel.fetchUser({_id: user._id});
                    } else {
                        console.log("No user found for entry");
                        return null;
                    }
                })
                .then(user => {
                    if (user) { 
                        if (user && process.env.NODE_ENV === 'production') {
                            return sendEmail.sendContestWinnerEmail(winnerDigest, user);
                        } else if(process.env.NODE_ENV === 'development') {
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