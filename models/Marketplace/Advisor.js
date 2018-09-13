/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 12:32:46
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-11 15:55:07
*/
'use strict';

const mongoose = require('../index');
const Schema = mongoose.Schema;

const Performance = require('./Performance');
const Investor = require('./Investor');

const Address = new Schema({
  	line1: String,
  	line2: String,
  	line3: String,
    city: String,
    state: String,
    pincode: String,
    country: String
});

const SocialProfile = new Schema({
	url: String,
	photoUrl: String,
	userId: String
});

const Rating = new Schema({
    current: Number,
    simulated: Number,
});

const AdvisorAnalytics = new Schema({
    date: Date,
    rating: Rating,
    numFollowers: Number,
    numAdvices: Number
});

const Advisor = new Schema({
   	user: {
        type: Schema.Types.ObjectId,
        ref:'User',
        required: true
    },

    approved: {
		type: Boolean,
    	required: true,
    	default: false,
    },

    approvalMessages:[{
    	user: {
    		type: Schema.Types.ObjectId,
        	ref:'User',
        	required: true
    	},
    	
    	date: {
    		type: Date,
    		required: true	
		},

    	message: {
    		type: String,
    		required: true,
    	},

    	approved: {
			type: Boolean,
    		required: true
		},
    }],

    followers: [{
    	investor: {
	        type: Schema.Types.ObjectId,
	        ref: 'Investor'
        },

        active: {
        	type: Boolean,
        	default: true,
        },

        updatedDate: Date
    }],
       
    profile: {
    	isCompany: {
            type: Boolean,
            default: false
        },
    	companyName: {
            type: String,
            default: ""
        },
    	companyRegistrationNum: {
            type: String,
            default: ""
        },
    	isSebiRegistered:  {
            type: Boolean,
            default: false
        },
    	sebiRegistrationNum: {
            type: String,
            default: ""
        },
    	address: Address,
    	phone: String, 
    	linkedIn: SocialProfile,
    	facebook: SocialProfile,
    	twitter: SocialProfile,
    	webUrl: String,
    	photoUrl: String
    },

    analytics: [AdvisorAnalytics],

    latestAnalytics: AdvisorAnalytics
});

Advisor.index({
    'profile.companyName': 'text'
});

Advisor.index({user: 1}, {unique: true});

Advisor.statics.saveAdvisor = function(advisorDetail) {
    const advisor = new this(advisorDetail);
    return advisor.saveAsync();
};

//Update the followers list
//Keeps a history of followers
//Adds if not following.
//Updates enddate if already following
Advisor.statics.updateFollowers = function(query, investorId) {
    return this.findOne(query)
    .then(advisor => {
        if (advisor) {
            var idx = advisor.followers.map(item => item.investor.toString()).indexOf(investorId.toString());
           
            if(idx == -1) {
        		advisor.followers.addToSet({investor: investorId, active: true, updatedDate:new Date()});
            } else {
            	advisor.followers[idx].active = !advisor.followers[idx].active;
            	advisor.followers[idx].updatedDate = new Date();
            }
        
        	return advisor.saveAsync();
    	}
    });
};

Advisor.statics.fetchAdvisors = function(query, options) {	
	var q = this.find(query)
				.populate('user', 'firstName lastName');

	if(options.skip) {
		q = q.skip(options.skip) 	
	}

	if(options.limit) {
		q = q.limit(options.limit)
	}			
	
	if(options.fields) {
		q = q.select(options.fields);
	}

	if (options.orderParam && options.order) {
        q = q.sort({[options.orderParam]: options.order});
    }
	
	return q.execAsync();
};

Advisor.statics.fetchAdvisor = function(query, options) {
	//FETCH creates a new document with default if insert is TRUE
	var q = this.findOneAndUpdate(query, {}, {upsert: options.insert, new: options.insert, setDefaultsOnInsert: options.insert})
			.populate('user', 'firstName lastName email');

	if(options.fields) {
		//options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	if((options.fields && options.fields.indexOf('advices')) || !options.fields) {
		q = q.populate('advices._id', null, { _id: { $ne: null }})
	}
	
	if((options.fields && options.fields.indexOf('followers')) || !options.fields) {
		q = q.populate('followers.user', 'firstName lastName', { _id: { $ne: null }})
	}

	return q.execAsync();
};

Advisor.statics.addAdvice = function(query, adviceId) {
	return this.findOne(query)
	.select('advices')
	.then(advisor => {
		if(advisor) {
			advisor.advices.push(adviceId);
		}

		return advisor.saveAsync();
	});
};

Advisor.statics.removeAdvice = function(query, adviceId) {
	return this.findOne(query)
	.then(advisor => {
		if(advisor) {
			advisor.advices.pull(adviceId);
			return advisor.saveAsync();
		} else {
			throw new Error("Advisor not found. Advice can't be removed");
		}
	});
};

Advisor.statics.updateAdvisor = function(query, updates, options) {
	return this.findOneAndUpdate(query, updates, options);
};

Advisor.statics.updateAnalytics = function(query, latestAnalytics) {
    return this.findOne(query, {analytics:1})
    .then(advisor => {
        var advisorAnalytics = advisor.analytics;
        var latestAnalyticsDate = latestAnalytics.date;

        if (!advisorAnalytics) {
        	advisor.analytics = [];
        }

        //Find date
        var idx = advisorAnalytics.map(item => item.date.getTime()).indexOf(latestAnalyticsDate.getTime());
        if (idx == -1) {
            advisorAnalytics.push(latestAnalytics);
        } else {
            Object.keys(latestAnalytics).forEach(key => {
                advisorAnalytics[idx][key] = latestAnalytics[key];
            });
        }

        if(!advisor.latestAnalytics) {
        	advisor.latestAnalytics = {};
        }

        advisor.latestAnalytics = latestAnalytics;

        return advisor.saveAsync();

    });
};

Advisor.statics.updateApproval = function(query, latestApproval) {
	
	var approvalMessage = latestApproval.message;
	var approvedStatus = latestApproval.approved;
	var user = latestApproval.user;

	const approvedMessage = ({
		date: new Date(), 
		message: approvalMessage,
		approved: approvedStatus,
		user: user
	});

	const updates = {'$set':{approved: approvedStatus}, '$push':{approvalMessages: approvedMessage}};		

	return this.findOneAndUpdate(query, updates);
}

function getTime(d) {
	return d.getTime();
}

function farfuture() {
	return new Date(2200, 1, 1);
}

function lessthan(d1, d2) {
	return d1.getTime() < d2.getTime();
}

const AdvisorModel = mongoose.model('Advisor', Advisor);
module.exports = AdvisorModel;
