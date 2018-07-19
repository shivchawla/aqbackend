'use strict';

const _ = require('lodash');
const mongoose = require('mongoose');
const DateHelper = require('../../utils/Date');
const Schema = mongoose.Schema;

const dateFormat = 'YYYY-MM-DD';

const RatingDetail = new Schema({
    value: Number,
    rank: Number,
    detail: [{field: String, ratingValue: Number, rank: Number, metricValue: Number}],
});
const Rank = new Schema({
    value: Number,
    date: Date,
    rating: {current: RatingDetail, simulated: RatingDetail}
});

const Contest = new Schema({
    creator: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    name: {
        type: String,
        required: true
    },

    startDate: {
        type: Date,
        required: true
    },

    endDate: {
        type: Date,
        required: true
    },

    advices: [{
        advice: {type: Schema.Types.ObjectId, ref: 'Advice'},
        withDrawn: Boolean,
        active: Boolean,
        prohibited: Boolean,
        lastUpdated: Date,
        rankingHistory:[Rank],
        latestRank: Rank,
    }],

    active: {
        type: Boolean,
        required: true
    },

    winners: [{
        advice: {type: Schema.Types.ObjectId, ref: 'Advice'},
        rank: Rank
    }],
    
    rules: {
        prize: [{
                rank: {
                    type: Number,
                    required: true
                },
                value: {
                    type: Number,
                    required: true
                }
            }
        ],
        ruleTemplateFileName: {
            type: String,
            required: true
        }
    }
});

Contest.statics.saveContest = function(contestDetail) {
    const contest = new this(contestDetail);
    return contest.saveAsync()
}

Contest.statics.updateContest = function(query, updates, options) {
    return this.findOneAndUpdate(query, updates, options);
}

Contest.statics.fetchContests = function(query, options = {}) {
    let q = this.find(query);
    if (options.skip) {
        q = q.skip(options.skip);
    }
    if (options.limit) {
        q = q.limit(options.limit);
    }
    if (options.fields) {
        q = q.select(options.fields);
    }

    return q.execAsync()
    .then(contests => {
        return this.count(query)
        .then(count => {
            return {
                contests, 
                count
            };
        })
    });
}

Contest.statics.fetchContest = function(query, options = {}) {
    let q = this.findOne(query);
    options.fields = _.get(options, 'fields', '');
    options.populate = _.get(options, 'populate', '');
    const adviceSkip = Number(_.get(options, 'advices.skip', 0));
    const adviceLimit = Number(_.get(options, 'advices.limit', 10));
    if (options.fields) {
        q = q.select(options.fields);
    }

    // if (options.fields.indexOf('advices') !== -1) {
    //     q = q.select({'advices': {$slice: [adviceSkip, adviceLimit]}});
    // }
    
    if (options.populate.indexOf('advice') !== -1) {
        q = q.select('advices.advice advices.latestRank').populate({
            path: 'advices.advice', 
            select: 'name advisor',
            populate: {
                path: 'advisor', 
                select: 'user',
                populate: {
                    path: 'user',
                    select: 'firstName lastName'
                }
            }
        });
    }

    //q = q.sort({"advices.latestRank.value": 1});
    
    return q.execAsync()
    .then(contest => {
        const advices = contest.advices.sort((a,b) => {
            // return a.latestRank.value > b.latestRank.value > 0 ? 1 : a.latestRank.value < b.latestRank.value ? -1 : 0
            return _.get(a, 'latestRank.value', 0) - _.get(b, 'latestRank.value',0);
        });
        if (adviceSkip + adviceLimit > advices.length) {
            contest.advices = _.slice(advices, adviceSkip, advices.length);
        } else {
            contest.advices = _.slice(advices, adviceSkip, adviceLimit + adviceSkip);
        }

        return contest;
    })
}

Contest.statics.insertAdviceToContest = function(query, adviceId) {
    return this.findOne(query)
    .then(contest => {
        if (contest) {
            const adviceIdx = _.findIndex(contest.advices, adviceItem => (adviceItem.advice).toString() === adviceId);
            if (adviceIdx === -1) {
                contest.advices.addToSet({
                    advice: adviceId, 
                    withDrawn: false, 
                    active: true, 
                    prohibited: false, 
                    lastUpdated: new Date()
                });
            } else {
                return Promise.reject(new Error('Advice already added to the contest'))
                // return new Error('Advice already added to the contest');
            }
            return contest.saveAsync();
        }
    })
}

Contest.statics.withdrawAdviceFromContest = function(query, adviceId) {
    return this.find(query)
    .then(contests => {
        contests.map(contest => {
            const adviceIdx = _.findIndex(contest.advices, adviceItem => (adviceItem.advice).toString() === adviceId);
            if (adviceIdx > -1) {
                const advice = contest.advices[adviceIdx];
                advice.active = false;
                advice.withDrawn = true;
                contest.advices[adviceIdx] = advice;
                contest.lastUpdated = new Date();
            }
            return contest.saveAsync();
        })
    })
}

Contest.statics.prohibitAdviceFromContest = function(query, adviceId) {
    return this.find(query)
    .then(contests => {
        contests.map(contest => {
            const adviceIdx = _.findIndex(contest.advices, adviceItem => (adviceItem.advice).toString() === adviceId);
            if (adviceIdx > -1) {
                const advice = contest.advices[adviceIdx];
                advice.active = false;
                advice.prohibited = true;
                contest.advices[adviceIdx] = advice;
                contest.lastUpdated = new Date();
            }
            return contest.saveAsync();
        })
    })
}

Contest.statics.updateRating = function(query, currentAdviceRankingData, simulatedAdviceRankingData, selectedDate, rankingDetail) {
    const today = DateHelper.getCurrentDate();

    return this.findOne(query)
    .then(contest => {
        if (contest) {
            contest.advices = contest.advices.map(adviceItem => {
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

            return contest.saveAsync();
        }
    })
}

Contest.statics.updateWinners = function(query, adviceRankingData, date) {
    return this.findOne(query)
    .then(contest => {
        const noOfWinners = contest.rules.prize.length;
        const contestEndDate = contest.endDate;
        const hasEnded = DateHelper.compareDates(contestEndDate, date) < 0 ? true : false;
        if (hasEnded) {
            let winners = [];
            adviceRankingData.map(rankingData => {
                winners.push({
                    advice: rankingData.adviceId,
                    rank: {
                        value: _.get(rankingData, 'rank', null), 
                        date, 
                        rating: _.get(rankingData, 'rating', null)
                    }
                })
            });
            const nWinners = winners.slice(0, noOfWinners);
            contest.winners = nWinners;
            contest.active = false;

            return contest.saveAsync();
        } else {
            return null;
        }
    })
}

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

const ContestModel = mongoose.model('Contest', Contest);
module.exports = ContestModel;