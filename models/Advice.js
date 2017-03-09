/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:09:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-09 22:03:25
*/
'use strict';

const Portfolio = require('./Portfolio')
const Security = require('./Security')

const Promise = require('bluebird');

const mongoose = require('./index');
const Schema = mongoose.Schema;

const PerformanceMetrics  = new Schema({
	date: Date,
	performance: Schema.Types.Mixed,
	rating: Number,
});

const PortfolioStats  = new Schema({
	date: Date,
	netValue: Number,
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
    	portfolio: Portfolio,
    	performanceMetrics: [PerformanceMetrics],
    	portfolioStats: [PortfolioStats] 
    },

	performanceMetrics: [PerformanceMetrics], // this is difficult (depends on)
	portfolioStats: [PortfolioStats],

    portfolioHistory: [{
    	startDate: Date,
    	endDate: Date,
    	portfolio: Portfolio, 
    }],

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

    advice.portfolioHistory.push(adviceDetails.currentPortfolio);

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

function _comparedates(d1, d2) {
	t1 = d1.getTime();
	t2 = d1.getTime();

	return (t1 < t2) ? -1 : (t1 == t2) ? 0 : 1;
}

const AdviceModel = mongoose.model('Advice', Advice);
module.exports = AdviceModel;
