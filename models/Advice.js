/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:09:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-08 22:51:34
*/
'use strict';

const Portfolio = require('./Portfolio')
const Security = require('./Security')

const Promise = require('bluebird');

const mongoose = require('./index');
const Schema = mongoose.Schema;

const PortfolioMetrics  = new Schema({
	date: Date,
	performance: Schema.Types.Mixed,
	rating: {
		type: Number,
		default: 0.0
	},
});

const Advice = new Schema({

	advisor: {
    	type: Schema.Types.ObjectId,
        require: true,
        ref: 'Advisor'
    },

    benchmark: Security,

    currentPortfolio: {
    	startDate: Date,
    	endDate: Date,
    	lastUpdatedDate:Date,
    	portfolio: Portfolio, 
    	metrics: [PortfolioMetrics],

    	netValue: [{
	    	date: Date,
	    	value: Number,
	    }],
    },

    netValue: [{
    	date: Date,
    	value: Number,
    }],

    metrics: {
    	lastUpatedDate: Date,
    	values: [PortfolioMetrics],
	},

    portfolioHistory: {
    	startDate: Date,
    	endDate: Date,
    	portfolio: Portfolio, 
    	metrics: [PortfolioMetrics]
    },

    createdDate: {
    	type: Date,
    	require: true,
    },

    updatedDate:{
    	type: Date,
    	require: true,
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

    subscribers: [{
	    type: Schema.Types.ObjectId,
        require: true,
        ref: 'Investor'
    }],
    	
	subscribersHistory: [{
		startDate: Date, 
		endDate: Date, 
		subscriber: {
	        type: Schema.Types.ObjectId,
	        require: true,
	        ref: 'Investor'
        }
    }],

	followers: [{
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Investor'
    }],
});

Advice.statics.saveAdvice = function(adviceDetails) {
    const advice = new this(adviceDetails);
    return advice.save();
};


Advice.statics.getAdvices = function(query, options) {
  	var q = this.find(query)
			
	if(options.fields) {
		options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	return q.execAsync();
};

Advice.statics.getAdvice = function(query, options) {
  	var q = this.findOne(query)
			
	if(options.fields) {
		options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
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
    return this.findOne(query)
        .then(advice => {
            if (advice) {
                
                if(updates.portfolio) {
                	var entry = {startDate: advice.updatedDate, endDate: new Date(), portfolio:advice.portfolio};
                	if(updates.portfolioHistory) {
            			advice.portfolioHistory.push(entry);
        			} else {
        				advice.portfolioHistory = [entry];
        			}
    			}

	            //Now update
	            const keys = Object.keys(updates);
	            keys.forEach(key => {
	                advice[key] = updates[key];
	            });

	            advice.updatedDate = new Date();
	            return advice.save();
            }
        });
};

Advice.statics.updateCurrentPortfolioPerformance = function(query, performance) {
    return this.findOne(query)
        .then(advice => {
            if (advice) {
            	console.log("dsdsdsd");
				
				if (advice.currentPortfolio.metrics.map(x => x.date).indexOf(performance.date) == -1) {			            
					advice.currentPortfolio.metrics.push({date: performance.date, performance: performance.value})
	            	advice.currentPortfolio.lastUpdatedDate = performance.date;
            	}
	            
	            // Separately add netvalue of current portfolio
	            if(advice.currentPortfolio.netValue.map(x => x.date).indexOf(performance.date) == -1) {
	            	advice.currentPortfolio.netValue.push({date: performance.date, value: performance.netValue})
	            }
	            
	            // Separately add netvalue of current portfolio to advice net value
	            if(advice.netValue.map(x => x.date).indexOf(performance.date) == -1) {
	            	advice.netValue.push({date: performance.date, value: performance.netValue})
	            }
	            return advice.save();
            }
        });
};


Advice.statics.updateAdvicePerformance = function(query, performance) {
    return this.findOne(query)
        .then(advice => {
            if (advice) {
            	
            	if(advice.metrics.map(x => x.date).indexOf(performance.date) == -1) {
	            	advice.metrics.values.push({date: performance.date, performance: performance.value});
            	}
            	
            	return advice.save();
            }
        });
};


Advice.statics.deleteAdvice = function(query) {
	return this.findOne(query)
		.then(advice => {
			if(advice){
				advice.deleted = true;
				advice.deletedDate = new Date();
			}

			return advice.save();
		});
};

//Update the followers list
//Keeps a history of followers
//Adds if not following.
//Updates enddate if already following
Advice.statics.updateFollowers = function(query, investorId) {
 	
    return this.findOne(query)
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
 	
    return this.findOne(query)
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

const AdviceModel = mongoose.model('Advice', Advice);
module.exports = AdviceModel;
