/*
* @Author: Shiv Chawla
* @Date:   2018-09-28 10:45:32
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-28 18:41:03
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Portfolio = require('./Portfolio');
const Security = require('./Security');
const Transaction = require('./Transaction');
const Performance = require('./Performance');
const Advisor = require('./Advisor');

const DateHelper = require('../../utils/Date');

const Rating = new Schema({
    current: Number,
    simulated: Number
});

const ContestEntry = new Schema({
    advisor: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Advisor'
    },

    name: {
        type: String,
        required: true
    },

    portfolio: {
        type: Schema.Types.ObjectId,
        ref:'Portfolio',
        required: true
    },

    createdDate: {
        type: Date,
        required: true
    },

    startDate: {
        type: Date,
        required: true,
    },

    updatedDate:{
        type: Date,
        required: true
    },

    deleted: {
        type: Boolean,
        default: false
    },

    deletedDate: Date,

    performanceSummary: Schema.Types.Mixed,

    rating: Rating,    
});

//TODO: Deleted advices can/should be moved to deleted-advice collection
//Such collection doesn't exist but can be a good improvement.
//ContestEntry.index({advisor: 1, name:1}, {unique: true});

ContestEntry.index({name: 1, advisor: 1}, {unique: true});
ContestEntry.index({advisor: 1}, {unique: false});
ContestEntry.index({portfolio: 1}, {unique: true});

ContestEntry.statics.saveContestEntry = function(entryDetails) {
    const contestEntry = new this(entryDetails);
    return contestEntry.saveAsync();
};

ContestEntry.statics.countEntries = function(query) {
    return this.countAsync(query);
};

ContestEntry.statics.fetchEntries = function(query, options) {
  	var q = this.find(query);

    if(options.skip) {
        q = q.skip(options.skip)    
    }

    if(options.limit) {
        q = q.limit(options.limit)
    }           
    
	if(options.fields) {
        q = q.select(options.fields);
	}

    if(options.fields && options.fields.indexOf('advisor') != -1) {
        q = q.select('advisor').populate({path:'advisor', select:'user _id',
                                        populate:{path: 'user', 
                                            select:'_id firstName lastName'}
                                });
    }
	
    if (options.orderParam && options.order) {
        q = q.sort({[options.orderParam]: options.order});
    }

    return Promise.all([
    	q.execAsync(),
    	this.count(query)
	]);
};

ContestEntry.statics.fetchEntry = function(query, options) {
  	var q = this.findOne(query);
	           
    if (!options.fields) {
        options.fields = '';
    }

    if (!options.populate) {
        options.populate = '';
    }

    if(options.fields) {
        q = q.select(options.fields);
    }

    if(options.populate.indexOf('benchmark') != -1) {
        q = q.select('portfolio').populate('portfolio','benchmark _id', { _id: { $ne: null }});
    }
    
    if(options.populate.indexOf('portfolio') != -1) {
        q = q.select('portfolio').populate('portfolio','detail benchmark deleted _id', { _id: { $ne: null }});
    }

    if(options.populate.indexOf('advisor') != -1) {
        q = q.select('advisor').populate({path:'advisor', select:'user _id',
                                        populate:{path: 'user', 
                                            select:'_id firstName lastName email'}
                                });
    }

	return q.execAsync();
};

ContestEntry.statics.getEntry = function(query, options) {
  	var q = this.findOne(query)
            
	if(options.fields) {
		options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	return q.execAsync();
};

ContestEntry.statics.updateEntry = function(query, updates, options) {
    return this.findOneAndUpdate(query, updates, options);
};

ContestEntry.statics.deleteEntry = function(query) {
	return this.findOne(query)
	.then(entry => {
		if(entry){
            if(!entry.deleted) {
                entry.deleted = true;
                entry.deletedDate = new Date();
                entry.name = entry.name+"_deleted_"+new Date().getTime();
	            return entry.saveAsync(); 
            } else {
                throw new Error("Entry already deleted");
            }
        } else {
            throw new Error("Entry not found");
        }
	});
};

//Will this be used??
//Is this used???
ContestEntry.statics.updatePerformance = function(query, performanceSummary) {
    return this.findOne(query, {performanceSummary:1})
    .then(entry => {

        if(!entry.performanceSummary) {
            entry.performanceSummary = {};
        }

        entry.performanceSummary = performanceSummary;

        return entry.saveAsync();
    });
};

ContestEntry.statics.updateRating = function(query, latestRating) {
    return this.findOne(query, {rating: 1})
    .then(entry => { 

        if(!entry.rating) {
            entry.rating = {};
        }   

        emtry.rating = latestRating.rating;
        return entry.saveAsync();
    });
};

const ContestEntryModel = mongoose.model('ContestEntry', ContestEntry);
module.exports = ContestEntryModel;
