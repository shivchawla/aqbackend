/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:09:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-06-30 14:53:09
*/
'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;

const Portfolio = require('./Portfolio');
const Security = require('./Security');
const Transaction = require('./Transaction');
const Performance = require('./Performance');
const Advisor = require('./Advisor');
const HelperFunctions = require("./helper");

//const Promise = require('bluebird');

const Advice = new Schema({
    advisor: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Advisor'
    },

    name: {
        type: String,
        require: true
    },

    description: {
        type: String,
        require: true
    },

    createdDate: {
        type: Date,
        require: true,
    },

    updatedDate:{
        type: Date,
        require: true,
    },

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

    benchmark: {
        type: Security,
        require: true,
    },

    portfolio: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Portfolio'
    },

    rating: [{
        value: {
            type: Number,
            default: 0
        },

        date: Date,

    }],

    advicePerformance: Performance,

    subscribers: [{
        user:{
    	    type: Schema.Types.ObjectId,
            require: true,
            ref: 'User'
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
            require: true,
            ref: 'User'
        },

        active: {
            type: Boolean,
            default: true
        },

        dateUpdated: Date,

    }],
});

Advice.statics.saveAdvice = function(adviceDetails) {
    console.log(adviceDetails);
    const advice = new this(adviceDetails);
    return advice.save();
};

Advice.statics.fetchAdvices = function(query, options) {
  	var q = this.find(query)
                .skip(options.skip)
                .limit(options.limit);

	if(options.fields) {
		//options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

    if(options.fields && options.fields.indexOf('advisor') != -1) {
        q = q.populate({path:'advisor', 
                        populate:{path: 'user', 
                                    select:'_id firstName lastName'}
                        });
        // null, { _id: { $ne: null }});
    } 
    //{path : 'userId', populate : {path : 'reviewId'}}

	return q.execAsync();
};

Advice.statics.fetchAdvice = function(query, options) {
  	var q = this.findOne(query);
	           
    if(options.fields) {
        //if(options.fields.indexOf('advicePerformance' != -1)) {
		  q = q.select(options.fields);
          //q = q.select(options.fields.concat(' portfolio benchmark'));
          //q = q.populate('portfolio', null, { _id: { $ne: null }});
        /*} else {
            q = q.select(options.fields);
        }*/
	}

    if(options.fields && options.fields.indexOf('portfolio') != -1) {
        q = q.populate('portfolio', null, { _id: { $ne: null }});
    }

	return q.execAsync();
    /*then(advice => {
        console.log(advice);
        var update = false;

        if(options.fields.indexOf('advicePerformance')) {
            //check if advice Performance is tha latest
            if(advice.advicePerformance) {
                var performance = advice.advicePerformance;

                if(getDate(performance.updatedDate) < getDate(new Date())) {
                    update = true;
                } 

            } else {
                update = true;
            }
        }

        if(update) {
             return Promise.all([true, HelperFunctions.calculatePerformanceAndUpdateAdvice(advice)]);
        } else {
            return [false, advice];
        }

    })
    .then(([updated, advice]) => {
        if(updated) {
            return q.select(options.fields).execAsync();
        } else {
            return advice;
        }
    });*/
   
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
    return this.findOne(query)
    .then(advice => {
        if (advice) {
            console.log(updates);
            //Now update
            const keys = Object.keys(updates);
            keys.forEach(key => {
                advice[key] = updates[key];
            });

            return advice.save();
        }
    });
};

Advice.statics.updateCurrentPortfolioPerformance = function(query, performance) {
    return this.findOne(query)
        .then(advice => {
            if (advice) {
            	console.log("dsdsdsd");
				
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
            	console.log(portfolioStats.values);
            	console.log(typeof(portfolioStats.values));

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
Advice.statics.updateFollowers = function(query, investorId) {
 	
    return this.findOne(query, {fields: 'followers'})
    .then(advice => {
        if (advice) {

            var idx = advice.followers.indexOf(investorId);
           
            if(idx == -1) {
        		advice.followers.addToSet(investorId);
            } else {
            	advice.followers.pull(investorId);
            }

            return advice.save();
        }
        
    });
};


Advice.statics.updateSubscribers = function(query, investorId) {
 	
    return this.findOne(query, {fields:'subscribers subscribersHistory'})
	.then(advice => {
        if (advice) {

            var idx = advice.subscribers.indexOf(investorId);
           
            if(idx == -1) {
        		advice.subscribers.addToSet(investorId);
            } else {
            	advice.subscribers.pull(investorId);
            }
            
            idx = advice.subscribersHistory.map(x => x.subscriber).lastIndexOf(investorId);
            
            if (idx == -1) {
            	//Insert the investor
            	advice.subscribersHistory.push({startdate: new Date(), enddate: farfuture(), subscriber:investorId});
            } else {
            	// Get the enddate
            	var endTime = advice.subscribersHistory[idx].enddate.getTime();
            	// Check if already following
            	if (endTime == farfuture().getTime()) {
            		//Set end date as NOW
            		advice.subscribersHistory[idx].enddate = new Date();
            	} else {
            		advice.subscribersHistory.push({startdate: new Date(), enddate: farfuture(), subscriber:investorId});
            	}
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
