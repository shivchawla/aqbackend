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

const Prize = new Schema({
    rank: {
        type: Number,
        required: true
    },
    value: {
        type: Number,
        required: true
    }
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
        prize: Prize,
        rank: Rank
    }],
    
    rules: {
        prize: [Prize],
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
    return this.findOneAndUpdate(query, {$set: updates}, options);
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


const ContestModel = mongoose.model('Contest', Contest);
module.exports = ContestModel;