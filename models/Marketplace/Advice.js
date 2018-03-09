/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:09:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-09 10:08:28
*/
'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Portfolio = require('./Portfolio');
const Security = require('./Security');
const Transaction = require('./Transaction');
const Performance = require('./Performance');
const Advisor = require('./Advisor');

const AdviceAnalytics = new Schema({
    date: Date,
    rating: Number,
    numSubscribers: Number,
    numFollowers: Number 
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

    heading: {
        type: String,
        required: true
    },

    description: {
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

    updatedDate:{
        type: Date,
        required: true
    },

    publishDetails: {
        status: {
            type: Boolean,
            default: false,
        },

        category: {
            type: String,
            default: "",
        },

        date: Date,
    },

    privateInvestorGroup: {
        groupName: String,
        investors: [{
            type: Schema.Types.ObjectId,
            ref:'Investor',
            required: true 
        }],
    },

    accessRequestFromInvestor: [{
        granted: {
            type: Boolean,
            default: false,
        },
        denied: {
            type: Boolean,
            default: false,
        },
        investor: {
            type: Schema.Types.ObjectId,
            ref: 'Investor',
            required: true 
        },
    }],

    approved: {
        type:Boolean,
        default: false
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

    deleted: {
        type: Boolean,
        default: false
    },

    deletedDate: Date,

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

        dateUpdated: Date,
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

        dateUpdated: Date,
    }],

    analytics: [AdviceAnalytics],

    latestPerformance: Schema.Types.Mixed,

    latestAnalytics: AdviceAnalytics,
    
});

//TODO: Deleted advices can/should be moved to deleted-advice collection
//Such collection doesn't exist but can be a good improvement.
//Advice.index({advisor: 1, name:1}, {unique: true});

//TODO: consider putting weights to index items
Advice.index({
    name: 'text',
    heading: 'text',
    description: 'text'
});

Advice.statics.saveAdvice = function(adviceDetails) {
    const advice = new this(adviceDetails);
    return advice.saveAsync();
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

    return q.execAsync();
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

Advice.statics.updateAdvice = function(query, updates) {
    return this.findOneAndUpdate(query, updates, {upsert:true, new: true});
};

Advice.statics.deleteAdvice = function(query) {
	return this.findOne(query)
	.then(advice => {
		if(advice){
			
            if(!advice.deleted) {
                advice.deleted = true;
                advice.deletedDate = new Date();
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
            var idx = advice.subscribers.map(item => item.investor.toString()).indexOf(investorId.toString());
            
            if(idx == -1) {
                advice.subscribers.addToSet({investor:investorId, active:true, dateUpdated: new Date()});
            } else {
                var subscriber = advice.subscribers[idx];
                subscriber.active = !subscriber.active;
                subscriber.dateUpdated = new Date();
                advice.subscribers[idx] = subscriber;
            }

            return advice.saveAsync();
        }      
    });
};

Advice.statics.updateAnalyticsAndPerformance = function(query, analyticsAndPerformance) {
    return this.findOne(query, {analytics:1, latestPerformance:1})
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

        var latestPerformance = analyticsAndPerformance.latestPerformance;

        if(!advice.latestPerformance) {
            advice.latestPerformance = {};
        }

        advice.latestPerformance = latestPerformance;
        advice.latestAnalytics = latestAnalytics;

        return advice.saveAsync();
    });
};

Advice.statics.fetchAdvicePortfolio = function(query, date) {
    if (!date || date == '') {
        return this.findOne(query).select('portfolio').populate('portfolio', 'detail').execAsync()
        .then(advice => {
            return advice.portfolio.detail;
        });
    } else {
        return this.findOne(query).select('portfolio').populate('portfolio','detail history').execAsync()
        .then(advice => {
            var advicePortfolio = advice.portfolio;
            if (_compareDates(date, advicePortfolio.detail.startDate) != -1) {
                return advice.portfolio.detail;
            } else {
                var detail = null;
                for(var historicalDetail of advicePortfolio.history){
                    if (_compareDates(date, historicalDetail.startDate) != -1) {
                        detail = historicalDetail;
                        break;
                    } 
                }

                return detail;
            }
        });    
    }
};

Advice.statics.updateApproval = function(query, latestApproval) {
    
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

Advice.statics.requestAccessToAdvice = function(query, investorId) {
    return this.findOne(query).select('accessRequestFromInvestor privateInvestorsGroup')
    .then(advice => {
        var privateInvestors = advice.privateInvestorGroup.investors;
        var idx = privateInvestors ? privateInvestors.map(item => item.toString()).indexOf(investorId.toString()) : -1;
        
        if(idx == -1) {
            //Allow if not already a private investors
            idx = advice.accessRequestFromInvestor.map(item => item.investor.toString()).indexOf(investorId.toString()); 
            if(idx == -1) {
                var request = {denied: false, granted: false, investor: investorId};
                advice.accessRequestFromInvestor.push(request);
            }
            
            return advice.saveAsync();
        } else {
            throw new Error("Already a member of the group");
        }
        
    })
    .then(advice => {
        return null;
    })
};

Advice.statics.acceptInvestorToGroup = function(query, investorId) {
    return this.findOne(query).select('privateInvestorGroup accessRequestFromInvestor')
    .then(advice => {
        var idx = advice.accessRequestFromInvestor.map(item => item.investor.toString()).indexOf(investorId.toString()); 
        if(idx != -1) {
            advice.accessRequestFromInvestor[idx].granted = true;
            advice.accessRequestFromInvestor[idx].denied = false;
            
            var privateInvestors = advice.privateInvestorGroup.investors;
            idx = privateInvestors ? privateInvestors.map(item => item.toString()).indexOf(investorId.toString()) : -1;
            if(idx == -1) {
                privateInvestors.push(investorId);
            }    
            
            return advice.saveAsync();
        } else {
            throw new Error("No access request found");
        }
    })
    .then(advice => {
        return null;
    }) 
};

Advice.statics.rejectInvestorFromGroup = function(query, investorId) {
    return this.findOne(query).select('privateInvestorGroup accessRequestFromInvestor')
    .then(advice => {
        var idx = advice.accessRequestFromInvestor.map(item => item.investor.toString()).indexOf(investorId.toString()); 
        if(idx != -1) {
            advice.accessRequestFromInvestor[idx].denied = true;
            advice.accessRequestFromInvestor[idx].granted = false;
        
            var privateInvestors = advice.privateInvestorGroup.investors;
            idx = privateInvestors ? privateInvestors.map(item => item.toString()).indexOf(investorId.toString()) : -1;
            if(idx !=-1) {
                advice.privateInvestorGroup.investors.splice(idx, 1);
            }
            
            return advice.saveAsync();
        } else {
            throw new Error("No access request found");
        }
    })
    .then(advice => {
        return null;
    }) 
};

function farfuture() {
	return new Date(2200, 1, 1);
}

function _compareDates(d1, d2) {
	var t1 = new Date(d1).getTime();
	var t2 = new Date(d2).getTime();

	return (t1 < t2) ? -1 : (t1 == t2) ? 0 : 1;
}

const AdviceModel = mongoose.model('Advice', Advice);
module.exports = AdviceModel;
