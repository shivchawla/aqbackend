'use strict';

const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
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
    const populate = _.get(options, 'populate', '');
    if (options.skip) {
        q = q.skip(options.skip);
    }
    if (options.limit) {
        q = q.limit(options.limit);
    }
    if (options.fields) {
        q = q.select(options.fields);
    }
    if (options.fields && options.fields.indexOf('winners') && populate.indexOf('advice') !== -1) {
        q = q.select(options.fields).populate({
            path: 'winners.advice', 
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
    const allAdvices = _.get(options, 'advices.all', false);
    const ignoreInactive = _.get(options, 'advices.ignoreInactive', true);
    if (options.fields) {
        q = q.select(options.fields);
    }
    
    if (options.populate.indexOf('advice') !== -1) {
        q = q.select('advices.advice advices.latestRank advices.active').populate({
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
    
    return q.execAsync()
    .then(contest => {
        const showAdvices = options.fields.indexOf('advices') !== -1;
        if (showAdvices) {
            let advices = ignoreInactive ? contest.advices.filter(advice => advice.active === true) : contest.advices;
            advices = advices.sort((a,b) => {
                return _.get(a, 'latestRank.value', 0) - _.get(b, 'latestRank.value',0);
            });
            contest.advices = advices;
            contest = {...contest.toObject(), advicesCount: advices.length};
            if (!allAdvices) {
                if (adviceSkip + adviceLimit > advices.length) {
                    contest.advices = _.slice(advices, adviceSkip, advices.length);
                } else {
                    contest.advices = _.slice(advices, adviceSkip, adviceLimit + adviceSkip);
                }
            }
        }

        return contest;
    })
}

Contest.statics.insertAdviceToContest = function(adviceId) {
    const currentDate = DateHelper.getCurrentDate();
    
    return this.find({active: true, startDate: {'$gt': currentDate}})
    .then(contests => {
        const contest = contests[0];
        if(contest) {
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
                const contestStartDate = _.get(contest, 'startDate', null);
                const currentDate = DateHelper.getCurrentDate();
                const haveNotStarted = DateHelper.compareDates(currentDate, contestStartDate) === -1;
                if (haveNotStarted) {
                    contest.advices[adviceIdx].withDrawn = false;
                    contest.advices[adviceIdx].active = true;
                    contest.advices[adviceIdx].prohibited = false;
                } else {
                    return Promise.reject(new Error('Advice already added to the contest'))
                }
                // return new Error('Advice already added to the contest');
            }

            return this.findOneAndUpdate({_id: contest._id}, {$set:contest}, {new: true, fields:'_id'});
        }
    })
}

Contest.statics.withdrawAdviceFromContest = function(query, adviceId) {    
    return this.find(query, {_id: 1})
    .then(contests => {
        return Promise.map(contests, (item) => {
            return this.findOne({_id: item._id})
            .then(contest => {
                const adviceIdx = _.findIndex(contest.advices, adviceItem => (adviceItem.advice).toString() === adviceId);
                if (adviceIdx > -1) {
                    const advice = contest.advices[adviceIdx];
                    advice.active = false;
                    advice.withDrawn = true;
                    contest.advices[adviceIdx] = advice;
                    contest.lastUpdated = new Date();
                }

                return this.findOneAndUpdate({_id: item._id}, {$set:contest}, {new: true, fields:'_id'});
            });
        });
    });
}


Contest.statics.prohibitAdviceFromContest = function(query, adviceId) {
    return this.find(query, {_id: 1})
    .then(contests => {
        return Promise.map(contests, (item) => {
            return this.findOne({_id: item._id})
            .then(contest => {
                const adviceIdx = _.findIndex(contest.advices, adviceItem => (adviceItem.advice).toString() === adviceId);
                if (adviceIdx > -1) {
                    const advice = contest.advices[adviceIdx];
                    advice.active = false;
                    advice.prohibited = true;
                    contest.advices[adviceIdx] = advice;
                    contest.lastUpdated = new Date();
                }
            
                return this.findOneAndUpdate({_id: item._id}, {$set:contest}, {new: true, fields:'_id'});
            });
        });
    });
}

Contest.statics.updateRating = function(query, currentAdviceRankingData, simulatedAdviceRankingData, selectedDate, rankingDetail) {
    const today = DateHelper.getCurrentDate();

    let contestId;
    return this.findOne(query, {advices: 1})
    .then(contest => {
        if (contest) {
            contestId = contest._id;
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

            return this.findOneAndUpdate({_id: contestId}, {$set:contest});
        }
    })
}

Contest.statics.updateWinners = function(query, currentAdviceRankingData, simulatedAdviceRankingData, date, rankingDetail) {
    return this.findOne(query, {winners: 1, active: 1, rules: 1, endDate: 1})
    .then(contest => {
        let contestId = contest._id;
        
        const noOfWinners = contest.rules.prize.length;
        const contestEndDate = contest.endDate;
        const hasEnded = DateHelper.compareDates(contestEndDate, date) < 0 ? true : false;
        if (hasEnded) {
            let winners = [];
            currentAdviceRankingData.map(rankingData => {
                const currentAdviceIdx = _.findIndex(currentAdviceRankingData, adviceData => adviceData.adviceId === (rankingData.adviceId).toString());
                const simulatedAdviceIdx = _.findIndex(simulatedAdviceRankingData, adviceData => adviceData.adviceId === (rankingData.adviceId).toString());
                const currentRatingValue = _.get(currentAdviceRankingData, `[${currentAdviceIdx}].rating`, null);
                const simulatedRatingValue = _.get(simulatedAdviceRankingData, `[${simulatedAdviceIdx}].rating`, null);
                const currentRatingRank = _.get(currentAdviceRankingData, `[${currentAdviceIdx}].rank`, null);
                const simulatedRatingRank = _.get(simulatedAdviceRankingData, `[${simulatedAdviceIdx}].rank`, null);
                
                winners.push({
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
                })
            });

            const nWinners = winners.slice(0, noOfWinners);
            contest.winners = nWinners;
            contest.active = false;

            return this.update({_id: contestId}, {$set: contest});
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