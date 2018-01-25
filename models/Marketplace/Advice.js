/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:09:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-25 12:09:43
*/
'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Portfolio = require('./Portfolio');
const Security = require('./Security');
const Transaction = require('./Transaction');
const Performance = require('./Performance');
const Advisor = require('./Advisor');

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

    portfolio: {
        type: Schema.Types.ObjectId,
        ref:'Portfolio',
        required: true
    },

    publishDate: {
        type: Date,
    }, 

    createdDate: {
        type: Date,
        required: true
    },

    updatedDate:{
        type: Date,
        required: true
    },

    //updateRequired:Boolean,

    public: {
        type: Boolean,
        default: false,
    },

    approved: {
        type:Boolean,
        default: false
    },

    approvedDate: Date,

    deleted: {
        type: Boolean,
        default: false
    },

    deletedDate: Date,

    //Is this portfolio history required? 
    //Is portfolio history within the portfolio object not sufficient?
    /*portfolioHistory: [{
        type: Schema.Types.ObjectId,
        ref: 'Portfolio'
    }],*/

    rating: [{
        value: {
            type: Number,
            default: 0
        },

        date: Date,
    }],

    //advicePerformance: Performance,

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
        user: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Investor'
        },

        active: {
            type: Boolean,
            default: true
        },

        dateUpdated: Date,
    }]
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
    return advice.save();
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
        q = q.populate({path:'advisor', 
                        populate:{path: 'user', 
                                    select:'_id firstName lastName'}
                        });
        // null, { _id: { $ne: null }});
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

Advice.statics.updateAdvice = function(query, updates, oldPortfolio) {
    
    var q = this.findOne(query);

    const keys = Object.keys(updates);
    var options = {};
    if(keys.indexOf('portfolio') != -1) {
        q = q.select('portfolio');
    }

    return q.execAsync()
    .then(advice => {
        var oldPortfolio = advice.portfolio;
        var fupdate = {$set: updates};
        
        //Update the portfolio array if it's TRULY a new Portfolio 
        //(not just an update to exisitng portfolio in case of non-public advice)
        if(keys.indexOf("portfolio") != -1 && !oldPortfolio) {
            fupdate = {$set: updates, $push:{portfolioHistory: oldPortfolio}};
        }
        
        return this.findOneAndUpdate(query, fupdate, {upsert:true, new: true});
    });
};

Advice.statics.updateCurrentPortfolioPerformance = function(query, performance) {
    return this.findOne(query)
    .then(advice => {
        if (advice) {
			if(advice.currentPortfolio.performanceMetrics.map(x => x.date).indexOf(performance.date) == -1) {
            	advice.currentPortfolio.performanceMetrics.push({date: performance.date, performance: performance.value, rating:0.0});
        	}
        	
            return advice.save();
        }
    });
};

Advice.statics.updateAdvicePortfolioStats = function(query, portfolioStats) {
    return this.findOne(query)
        .then(advice => {
            if (advice) {
            	
            	portfolioStats.values = portfolioStats.values[0];

            	if(portfolioStats.values.length > 0) {
            		// if new portfolioStats has new length
            		if (portfolioStats.values.length > advice.portfolioStats.length) {
	            		advice.portfolioStats = [];
	            		
	            		if (portfolioStats.values.length == portfolioStats.dates.length) {
	            			var n = portfolioStats.values.length;
	            			for(var i=0;i<n;i++){
	            				advice.portfolioStats.push({date: new Date(portfolioStats.dates[i]),
	            										netValue: portfolioStats.values[i]});
	            			}	
	            		}
            		}
        		}

            	return advice.save();
            }
        });
};

Advice.statics.updateCurrentPortfolioPortfolioStats = function(query, portfolioStats) {
    return this.findOne(query)
        .then(advice => {
            if (advice) {
            	
            	portfolioStats.values = portfolioStats.values[0];
            	console.log(portfolioStats.values);
            	console.log(typeof(portfolioStats.values));

            	if(portfolioStats.values.length > 0) {
            		// if new portfolioStats has new length
            		if (portfolioStats.values.length > advice.currentPortfolio.portfolioStats.length) {
	            		advice.currentPortfolio.portfolioStats = [];
	            		
	            		if (portfolioStats.values.length == portfolioStats.dates.length) {
	            			var n = portfolioStats.values.length;
	            			for(var i=0;i<n;i++){
	            				advice.currentPortfolio.portfolioStats.push({date: new Date(portfolioStats.dates[i]),
	            										netValue: portfolioStats.values[i]});
	            			}	
	            		}
            		}
        		}

            	return advice.save();
            }
        });
};

Advice.statics.updateAdvicePerformance = function(query, performance) {
    return this.findOne(query)
    .then(advice => {
        if (advice) {
        	if(advice.performanceMetrics.map(x => x.date).indexOf(performance.date) == -1) {
            	advice.performanceMetrics.push({date: performance.date, performance: performance.value, rating: 0.0});
        	}
        	return advice.save();
        }
    });
};

Advice.statics.deleteAdvice = function(query) {
	return this.findOne(query)
	.then(advice => {
		if(advice){
			
            if(!advice.deleted) {
                advice.deleted = true;
                advice.deletedDate = new Date();
	            return advice.save(); 
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
Advice.statics.updateFollowers = function(query, userId) {
 	
    return this.findOne(query, {followers: 1})
    .then(advice => {
        if (advice) {
            var idx = advice.followers.map(item => item.user.toString()).indexOf(userId.toString());
            
            if(idx == -1) {
        		advice.followers.addToSet({user:userId, active:true, dateUpdated: new Date()});
            } else {
            	var follower = advice.followers[idx];
                follower.active = !follower.active;
                follower.dateUpdated = new Date();
                advice.followers[idx] = follower;
            }

            return advice.save();
        }      
    });
};

Advice.statics.updateSubscribers = function(query, userId) {
 	
    return this.findOne(query, {subscribers: 1})
    .then(advice => {
        if (advice) {
            var idx = advice.subscribers.map(item => item.user.toString()).indexOf(userId.toString());
            
            if(idx == -1) {
                advice.subscribers.addToSet({user:userId, active:true, dateUpdated: new Date()});
            } else {
                var subscriber = advice.subscribers[idx];
                subscriber.active = !subscriber.active;
                subscriber.dateUpdated = new Date();
                advice.subscribers[idx] = subscriber;
            }

            return advice.save();
        }      
    });
};

function farfuture() {
	return new Date(2200, 1, 1);
}

function _comparedates(d1, d2) {
	t1 = d1.getTime();
	t2 = d1.getTime();

	return (t1 < t2) ? -1 : (t1 == t2) ? 0 : 1;
}

const AdviceModel = mongoose.model('Advice', Advice);
module.exports = AdviceModel;
