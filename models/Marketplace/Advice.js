/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:09:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-07-13 19:56:36
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

const AdviceAnalytics = new Schema({
    date: Date,
    rating: Rating,
    numSubscribers: Number,
    numFollowers: Number ,
    dailyChgSubscribers: Number,
    dailyChgFollowers:Number
});

const Requirement = new Schema({
    type: String,
    required: false
});

const Approval = new Schema({
    field: {
        type: String,
        required: true,
    },
    reason: String,
    valid: {
        type: Boolean,
        required: true,
        default: false
    },
    requirements: [String]
});

const Goal = new Schema({
    field: {
        type: String,
        required: true
    },
    investorType: {
        type: String,
        required: false
    },
    suitability: {
        type: String,
        required: false
    },
    valid: {
        type: Boolean,
        default: false
    },
    reason: String
});

const Sectors = new Schema({
    detail: {
        type: [String],
        required: true
    },
    valid: {
        type: Boolean,
        default: false
    },
    reason: String
});

const PortfolioOption = new Schema({
    field: {
        type: String,
        required: true
    },
    valid: {
        type: Boolean,
        required: false
    },
    reason: String
});

const UserText = new Schema({
    detail: String,
    valid: {
        type: Boolean,
        default: false
    },
    reason: String
});

const Advice = new Schema({
    advisor: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Advisor'
    },

    name: {
        type: String,
        required: true
    },

    rebalance: {
        type: String,
        required: true
    },

    maxNotional: {
        type: Number,
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

    public: {
        type: Boolean,
        default: false,
    },

    contestOnly: {
        type: Boolean,
        default: false
    },

    publishDate: {
        type: Date,
    }, 

    latestApproval: {
        date: Date,
        detail: [Approval],
        message: String,
        status: {
            type: Boolean,
            required: false
        },
        user: {
            type: Schema.Types.ObjectId,
            ref:'User',
        }
    },

    approval: [{
        date: Date,
        detail: [Approval],
        message: String,
        status: {
            type: Boolean,
            required: true
        },
        user: {
            type: Schema.Types.ObjectId,
            ref:'User',
            required: true
        },
    }],

    approvalRequested: {
        type: Boolean,
        default: true
    },

    investmentObjective: {
        goal: Goal,
        sectors: Sectors,
        portfolioValuation: PortfolioOption,
        capitalization: PortfolioOption,
        userText: UserText
    },

    deleted: {
        type: Boolean,
        default: false
    },

    deletedDate: Date,

    prohibited: {
        type: Boolean,
        default: false
    },

    subscribers: [{
        investor:{
    	    type: Schema.Types.ObjectId,
            required: true,
            ref: 'Investor'
        },

        active: {
            type: Boolean,
            default: true
        },

        updatedDate: Date,

        startDate: Date,
       
        endDate: Date,

        discontinueRequested: {
            type: Boolean,
            default: false
        },
    }],
    	
	followers: [{
        investor: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Investor'
        },

        active: {
            type: Boolean,
            default: true
        },

        updatedDate: Date,
    }],

    analytics: [AdviceAnalytics],

    latestAnalytics: AdviceAnalytics,

    performanceSummary: Schema.Types.Mixed,

    rating: Rating,    
});

//TODO: Deleted advices can/should be moved to deleted-advice collection
//Such collection doesn't exist but can be a good improvement.
//Advice.index({advisor: 1, name:1}, {unique: true});

Advice.index({name: 1, advisor: 1}, {unique: true});
Advice.index({advisor: 1}, {unique: false});
Advice.index({portfolio: 1}, {unique: true});

Advice.statics.saveAdvice = function(adviceDetails) {
    const advice = new this(adviceDetails);
    return advice.saveAsync();
};

Advice.statics.countAdvices = function(query) {
    return this.countAsync(query);
};

Advice.statics.fetchAdvices = function(query, options) {
  	var q = this.find(query);

    if(options.skip) {
        q = q.skip(options.skip)    
    }

    if(options.limit) {
        q = q.limit(options.limit)
    }           
    
	if(options.fields) {
        q = q.select(options.fields);
        if (options.fields.indexOf('approval')) {
            q = q.select({approval: {$slice: -1}});
       }
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

    return q.execAsync()
    .then(advices => {
        return this.count(query)
        .then(count => {
            return [advices, count];
        });
    });

};

Advice.statics.fetchAdvice = function(query, options) {
  	var q = this.findOne(query);
	           
    if (!options.fields) {
        options.fields = '';
    }

    if (!options.populate) {
        options.populate = '';
    }

    if(options.fields) {
        q = q.select(options.fields);
        if (options.fields.indexOf('approval')) {
            q = q.select({approval: {$slice: -1}});
       }
    }
    
    if(options.populate.indexOf('portfolio') != -1) {
        q = q.select('portfolio').populate('portfolio','detail benchmark deleted _id', { _id: { $ne: null }});
    }

    if(options.populate.indexOf('benchmark') != -1) {
        q = q.select('portfolio').populate('portfolio','benchmark _id', { _id: { $ne: null }});
    }

    if(options.populate.indexOf('advisor') != -1) {
        q = q.select('advisor').populate({path:'advisor', select:'user _id',
                                        populate:{path: 'user', 
                                            select:'_id firstName lastName'}
                                });
    }

	return q.execAsync();
};

Advice.statics.getAdviceHistory = function(query, options) {
  	var q = this.findOne(query)
            
	if(options.fields) {
		options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	return q.execAsync();
};

Advice.statics.updateAdvice = function(query, updates, options) {
    return this.findOneAndUpdate(query, updates, options);
};

Advice.statics.deleteAdvice = function(query) {
	return this.findOne(query)
	.then(advice => {
		if(advice){
            if(!advice.deleted) {
                advice.deleted = true;
                advice.deletedDate = new Date();
                advice.name = advice.name+"_deleted_"+new Date().getTime();
	            return advice.saveAsync(); 
            } else {
                throw new Error("Advice already deleted");
            }
        } else {
            throw new Error("Advice not found");
        }
	});
};

//Update the followers list
//Keeps a history of followers
//Adds if not following.
//Updates enddate if already following
Advice.statics.updateFollowers = function(query, investorId) {
 	
    return this.findOne(query, {followers: 1})
    .then(advice => {
        if (advice) {
            var idx = advice.followers.map(item => item.investor.toString()).indexOf(investorId.toString());
            
            if(idx == -1) {
        		advice.followers.addToSet({investor:investorId, active:true, dateUpdated: new Date()});
            } else {
            	var follower = advice.followers[idx];
                follower.active = !follower.active;
                follower.dateUpdated = new Date();
                advice.followers[idx] = follower;
            }

            return advice.saveAsync();
        }      
    });
};

Advice.statics.updateSubscribers = function(query, investorId) {
 	
    return this.findOne(query, {subscribers: 1})
    .then(advice => {
        if (advice) {
            var advSubs = advice.subscribers; 
            var idx = advSubs.map(item => item.investor.toString()).indexOf(investorId.toString());
            
            var currentDate = DateHelper.getCurrentDate();
            var oneMonthLater = DateHelper.getDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0));         
            
            if(idx == -1) {
                advSubs.addToSet({investor:investorId, active:true, updatedDate: new Date(), startDate: currentDate, endDate: oneMonthLater});
            } else {
                
                var subscriber = advSubs[idx];

                //IF SUBSCRIBED 
                //and END date is greater than current date, then set request as TRUE
                //Don't Change the subscription status
                //ELSE Change to inactive or active and set expiry time to 1 month for now 
               
                /****CHANGE DATES COMPARISON TO JUST MATCH DATES (NOT TIME)****/
                
                var endDate = subscriber.endDate ? subscriber.endDate : oneMonthLater;

               
                if (subscriber.active && DateHelper.compareDates(endDate, currentDate) != -1) {
                    subscriber.discontinueRequested = true;
                } else if(subscriber.active) {
                     subscriber.active = false;
                } else {
                    subscriber.active = true;
                    subscriber.endDate = oneMonthLater;
                }
                
                advSubs[idx] = subscriber;
            }

            return advice.saveAsync();
        }      
    });
};

Advice.statics.updateAnalyticsAndPerformance = function(query, analyticsAndPerformance) {
    return this.findOne(query, {analytics:1, performanceSummary:1, latestAnalytics:1})
    .then(advice => {
        var adviceAnalytics = advice.analytics;
        var latestAnalytics = analyticsAndPerformance.analytics;
        var latestAnalyticsDate = latestAnalytics.date;

        if(!adviceAnalytics) {
            advice.analytics = [];
        }

        //Find date
        var idx = adviceAnalytics.map(item => item.date.getTime()).indexOf(latestAnalyticsDate.getTime());
        if (idx == -1) {
            adviceAnalytics.push(latestAnalytics);
        } else {
            Object.keys(latestAnalytics).forEach(key => {
                adviceAnalytics[idx][key] = latestAnalytics[key];
            });
        }

        var performanceSummary = analyticsAndPerformance.performanceSummary;

        if(!advice.performanceSummary) {
            advice.performanceSummary = {};
        }

        if(!advice.latestAnalytics) {
            advice.latestAnalytics = {};
        }

        advice.performanceSummary = performanceSummary;
        advice.latestAnalytics = latestAnalytics;

        return advice.saveAsync();
    });
};

Advice.statics.updateRating = function(query, latestRating) {
    return this.findOne(query, {analytics:1, rating: 1})
    .then(advice => { 

        if(!advice.analytics) {
            advice.analytics = [];
        }

        var adviceAnalytics = advice.analytics;

        //Find date
        var idx = adviceAnalytics.map(item => item.date.getTime()).indexOf(latestRating.date.getTime());
        if (idx == -1) {
            adviceAnalytics.push(latestRating);
        } else {
            adviceAnalytics[idx]["rating"] = latestRating.rating;
        }

        if(!advice.rating) {
            advice.rating = {};
        }   

        advice.rating = latestRating.rating;

        return advice.saveAsync();
    });
};


Advice.statics.updateApproval = function(query, latestApproval) {
    
    var approvalStatus = latestApproval.approved ? "approved" : "rejected" ;
    var user = latestApproval.user;

    var prohibited = latestApproval.prohibit;

    const approvedMessage = {
        date: new Date(), 
        message: latestApproval.message,
        approved: latestApproval.approved,
        user: user
    };

    const updates = {'$set':{approvalStatus: approvalStatus, prohibited: prohibited}, '$push':{approvalMessages: approvedMessage}};       

    return this.findOneAndUpdate(query, updates);
}

Advice.statics.updateApprovalObj = function(query, latestApproval) {
    const approvalStatus = latestApproval.status;
    const user = latestApproval.user.toString();
    const approvalDate = new Date();
    const approvedMessage = latestApproval.message;
    const approvalDetail = latestApproval.detail; 
    const investmentObjective = latestApproval.investmentObjective;
    const approval = {
        date: new Date(),
        detail: approvalDetail,
        message: approvedMessage,
        status: approvalStatus,
        user
    };
    const updates = {'$set': {
        investmentObjective: investmentObjective, 
        approvalRequested: false, 
        latestApproval: approval
    }, 
    '$push': {approval:  approval}};
    return this.findOneAndUpdate(query, updates);
}

const AdviceModel = mongoose.model('Advice', Advice);
module.exports = AdviceModel;
