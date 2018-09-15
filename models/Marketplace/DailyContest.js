/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:31:05
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-15 20:19:10
*/

'use strict';

const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const Schema = mongoose.Schema;

const DateHelper = require('../../utils/Date');
const Performance = require('./DailyContestEntry');
const Security = require('./Security');

const dateFormat = 'YYYY-MM-DD';

const RatingDetail = new Schema({
    value: Number,
    rank: Number,
    detail: [{field: String, ratingValue: Number, rank: Number, metricValue: Number}],
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

const DailyContest = new Schema({
    creator: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },

    startDate: {
        type: Date,
        required: true
    },

    endDate: {
        type: Date,
        required: true
    },

    resultDate: {
        type: Date,
        required: true
    },

    active: {
        type: Boolean,
        default: false
    },

    entries: [{type: Schema.Types.ObjectId, ref: 'DailyContestEntry'}],

    winners: [{
        advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
        rank: Number,
        pnlStats: Schema.Types.Mixed
    }],

    topStocks: [{
        security: Security,
        numUsers: Number,
    }],

    totalPositions:[{
        security: Security,
        netInvestment: Number,
        longInvestment: Number,
        shortInvestment:Number,
        numUsers: Number
    }]
});

DailyContest.statics.saveContest = function(contestDetail) {
    const contest = new this(contestDetail);
    return contest.saveAsync()
};

DailyContest.statics.enterContest = function(query, entryId) {
	return this.findOneAndUpdateAsync(query, {$push: {entries: entryId}});
};

DailyContest.statics.updateContest = function(query, updates, options) {
    return this.findOneAndUpdateAsync(query, {$set: updates}, options);
}

DailyContest.statics.fetchContests = function(query, options = {}) {
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
    if (options.fields && options.fields.indexOf('winners') && populate.indexOf('advisor') !== -1) {
        q = q.select(options.fields).populate({
            path: 'advisor', 
            select: 'user',
            populate: {
                path: 'user',
                select: 'firstName lastName'
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

DailyContest.statics.fetchContest = function(query, options = {}) {
    let q = this.findOne(query);
    options.fields = _.get(options, 'fields', '');
    options.populate = _.get(options, 'populate', '');
    const entriesSkip = Number(_.get(options, 'entries.skip', 0));
    const entriesLimit = Number(_.get(options, 'entries.limit', 10));
    const allEntries = _.get(options, 'entries.all', false);
    
    if (options.fields) {
        q = q.select(options.fields);
    }

    if (options.populate.indexOf('winners') !== -1) {
        q = q.select('winners').populate({
            path: 'winners.advisor',
            select: 'user',
            populate: {
                path: 'user',
                select: 'firstName lastName'
            }
        });
    }
    
    if (options.populate.indexOf('entries') !== -1) {
        q = q.select('entries').populate({
            select: 'detail advisor',
            populate: {
                path: 'advisor.user',
                select: 'firstName lastName'
            }
        });
    }
    
    return q.execAsync()
    .then(contest => {
        const showEntries = options.fields.indexOf('entries') !== -1;
        if (showEntries && contest) {
            let entries = contest.entries;

            contest = {...contest.toObject(), entriesCount: entries.length};
            if (!allEntries) {
                if (entriesSkip + entriesLimit > entries.length) {
                    contest.entries = _.slice(entries, entriesSkip, entries.length);
                } else {
                    contest.entries = _.slice(entries, entriesSkip, entriesLimit + entriesSkip);
                }
            }
        }

        return contest;
    })
}

const DailyContestModel = mongoose.model('DailyContest', DailyContest);
module.exports = DailyContestModel;
