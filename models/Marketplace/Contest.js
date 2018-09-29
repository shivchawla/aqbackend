'use strict';

const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const ContestEntry = require('./ContestEntry');
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

    entries: [{
        entry: {type: Schema.Types.ObjectId, ref: 'ContestEntry'},
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
        entry: {type: Schema.Types.ObjectId, ref: 'ContestEntry'},
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
    if (options.fields && options.fields.indexOf('winners') && populate.indexOf('entry') !== -1) {
        q = q.select(options.fields).populate({
            path: 'winners.entry', 
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

    return Promise.all([
        q.execAsync(),
        this.count(query)
    ]);
}

Contest.statics.fetchContest = function(query, options = {}) {
    let q = this.findOne(query);
    options.fields = _.get(options, 'fields', '');
    options.populate = _.get(options, 'populate', '');
    const entrySkip = Number(_.get(options, 'entries.skip', 0));
    const entryLimit = Number(_.get(options, 'entries.limit', 10));
    const allEntries = _.get(options, 'entries.all', false);
    const ignoreInactive = _.get(options, 'entries.ignoreInactive', true);
    if (options.fields) {
        q = q.select(options.fields);
    }
    
    if (options.populate.indexOf('entry') !== -1) {
        q = q.select('entries.entry entries.latestRank entries.active').populate({
            path: 'entries.entry', 
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
        const showEntries = options.fields.indexOf('entries') !== -1;
        if (showEntries) {
            let entries = ignoreInactive ? contest.entries.filter(entry => entry.active === true) : contest.entries;
            entries = entries.sort((a,b) => {
                return _.get(a, 'latestRank.value', 0) - _.get(b, 'latestRank.value',0);
            });
            contest.entries = entries;
            contest = {...contest.toObject(), entriesCount: entries.length};
            if (!allEntries) {
                if (entrySkip + entryLimit > entries.length) {
                    contest.entries = _.slice(entries, entrySkip, entries.length);
                } else {
                    contest.entries = _.slice(entries, entrySkip, entryLimit + entrySkip);
                }
            }
        }

        return contest;
    })
}

Contest.statics.insertEntryToContest = function(entryId) {
    const currentDate = DateHelper.getCurrentDate();
    
    return this.find({active: true, startDate: {'$gt': currentDate}})
    .then(contests => {
        const contest = contests[0];
        if(contest) {
            const entryIdx = _.findIndex(contest.entries, entryItem => (entryItem.entry).toString() === entryId);
            if (entryIdx === -1) {
                contest.entries.addToSet({
                    entry: entryId, 
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
                    contest.entries[entryIdx].withDrawn = false;
                    contest.entries[entryIdx].active = true;
                    contest.entries[entryIdx].prohibited = false;
                } else {
                    return Promise.reject(new Error('Entry already added to the contest'))
                }
                // return new Error('Entry already added to the contest');
            }

            return this.findOneAndUpdate({_id: contest._id}, {$set:contest}, {new: true, fields:'_id'});
        }
    })
}

Contest.statics.withdrawEntryFromContest = function(query, entryId) {    
    return this.find(query, {_id: 1})
    .then(contests => {
        return Promise.map(contests, (item) => {
            return this.findOne({_id: item._id})
            .then(contest => {
                const entryIdx = _.findIndex(contest.entries, entryItem => (entryItem.entry).toString() === entryId);
                if (entryIdx > -1) {
                    const entry = contest.entries[entryIdx];
                    entry.active = false;
                    entry.withDrawn = true;
                    contest.entries[entryIdx] = entry;
                    contest.lastUpdated = new Date();
                }

                return this.findOneAndUpdate({_id: item._id}, {$set:contest}, {new: true, fields:'_id'});
            });
        });
    });
}

Contest.statics.prohibitEntryFromContest = function(query, entryId) {
    return this.find(query, {_id: 1})
    .then(contests => {
        return Promise.map(contests, (item) => {
            return this.findOne({_id: item._id})
            .then(contest => {
                const entryIdx = _.findIndex(contest.entries, entryItem => (entryItem.entry).toString() === entryId);
                if (entryIdx > -1) {
                    const entry = contest.entries[entryIdx];
                    entry.active = false;
                    entry.prohibited = true;
                    contest.entries[entryIdx] = entry;
                    contest.lastUpdated = new Date();
                }
            
                return this.findOneAndUpdate({_id: item._id}, {$set:contest}, {new: true, fields:'_id'});
            });
        });
    });
}


const ContestModel = mongoose.model('Contest', Contest);
module.exports = ContestModel;