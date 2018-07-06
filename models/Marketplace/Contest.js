'use strict';

const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');
const Schema = mongoose.Schema;

const dateFormat = 'YYYY-MM-DD';

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
        ranking:[{value: Number, date: Date}],
        latestRank: {value: Number, date: Date},
    }],

    active: {
        type: Boolean,
        required: true
    },

    winners: [{
        advice: {type: Schema.Types.ObjectId, ref: 'Advice'},
        rank: {
            required: true,
            type: Number
        }
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
    let q = this.find(query);
    options.fields = _.get(options, 'fields', '');
    options.populate = _.get(options, 'populate', '');

    if (options.fields) {
        q = q.select(options.fields);
    }

    return q.execAsync();
}

//Is this use anyehere???
Contest.statics.modifyAdviceInContest = function(query, adviceId, type) {
    switch(type) {
        case "enter":
            return this.insertAdviceToContest(query, adviceId);
        case "withdraw":
            return this.withdrawAdviceFromContest(query, adviceId);
        case "prohibit":
            return this.withdrawAdviceFromContest(query, adviceId);
        default:
            return this.insertAdviceToContest(query, adviceId);
    }
}

Contest.statics.insertAdviceToContest = function(query, adviceId) {
    return this.findOne(query)
    .then(contest => {
        if (contest) {
            const adviceIdx = _.findIndex(contest.advices, advice => (advice.advice).toString() === adviceId);
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
    .catch(err => {
        return err;
    });
}

Contest.statics.withdrawAdviceFromContest = function(query, adviceId) {
    return this.findOne(query)
    .then(contest => {
        if (contest) {
            const adviceIdx = _.findIndex(contest.advices, advice => (advice.advice).toString() === adviceId);
            if (adviceIdx > -1) {
                // contest.advices.addToSet({advice: adviceId, withDrawn: false, active: true, prohibit: false});
                const advice = contest.advices[adviceIdx];
                advice.active = false;
                advice.withDrawn = true;
                contest.advices[adviceIdx] = advice;
                contest.lastUpdated = new Date();
            } else {
                return new Error('Advice not added to contest');
            }

            return contest.saveAsync();
        }
    })
    .catch(err => {
        return err;
    });
}

Contest.statics.prohibitAdviceFromContest = function(query, adviceId) {
    return this.findOne(query)
    .then(contest => {
        if (contest) {
            
            //DON"T we need to convert adviceId to STRING            
            const adviceIdx = _.findIndex(contest.advices, advice => (advice.advice).toString() === adviceId);
            if (adviceIdx > -1) {
                // contest.advices.addToSet({advice: adviceId, withDrawn: false, active: true, prohibit: false});
                const advice = contest.advices[adviceIdx];
                advice.active = false;
                advice.prohibited = true;
                contest.advices[adviceIdx] = advice;
                contest.lastUpdated = new Date();
            } else {
                return new Error('Advice not added to contest');
            }

            return contest.saveAsync();
        }
    })
    .catch(err => {
        return err;
    });
}

Contest.statics.updateRating = function(query, adviceRankingData, selectedDate) {
    const today = moment().format(dateFormat);
    return this.findOne(query)
    .then(contest => {
        if (contest) {
            contest.advices = contest.advices.map(advice => {
                const adviceIdx = _.findIndex(adviceRankingData.rankingData, adviceData => adviceData.adviceId === (advice.advice).toString());
                if (adviceIdx > -1) {
                    const value = _.get(adviceRankingData, `rankingData[${adviceIdx}].value`, null);
                    const date = moment(selectedDate).format(dateFormat);
                    // find if the date already exists in the rating array
                    const rankingIdx = _.findIndex(advice.ranking, rankData => {
                        const rankDate = rankData.date;
                        const nDate =  moment(rankDate).format(dateFormat);
                        return moment(nDate).isSame(date, 'day');
                    });
                    if (rankingIdx === -1) { // If date doesn't exist push it into the history
                        advice.ranking.push({value, date});
                    } else { // Modify the rank value
                        advice.ranking[rankingIdx].value = value;
                    }
                    // Only modify the latestRank if the date is today
                    if (moment(today).isSame(date, 'day')){
                        advice.latestRank = {value, date};
                    }
                }

                return advice;
            })

            return contest.saveAsync();
        }
    })
    .catch(err => err);
}

const ContestModel = mongoose.model('Contest', Contest);
module.exports = ContestModel;