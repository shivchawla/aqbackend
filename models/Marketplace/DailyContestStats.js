/*
* @Author: Shiv Chawla
* @Date:   2018-10-29 10:47:05
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-05 16:05:47
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

const DailyContestStats = new Schema({
    date: {
        type: Date,
        required: true
    },

    winners: [{
        advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
        rank: Number,
        pnlStats: Schema.Types.Mixed
    }],

    predictionMetrics: Schema.Types.Mixed,
	
	topStocks: Schema.Types.Mixed
    
});

DailyContestStats.statics.saveContestStats = function(stats) {
    const contestStats = new this(stats);
    return contestStats.saveAsync()
};

DailyContestStats.statics.updateContestStats = function(date, stats) {
    return this.findOneAndUpdateAsync({date:date}, {$set: stats}, {upsert: true})
};

DailyContestStats.statics.fetchContestStats = function(date, options) {
    let q = this.findOne({date: date});
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
    
    return q.execAsync();
};

const DailyContestStatsModel = mongoose.model('DailyContestStats', DailyContestStats);
module.exports = DailyContestStatsModel;
