/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:53:13
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-22 14:25:49
*/

'use strict';

//const PerformanceMetrics = require('./Common');
const mongoose = require('./index');
const Schema = mongoose.Schema;

const Portfolio = require('./Portfolio');
const Transaction = require('./Transaction');
const PortfolioStats = require('./PortfolioStats');
const PerformanceMetrics = require('./PerformanceMetrics');

const Investor = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },

    active: {
    	type: Boolean,
    	require: true
    },

	startDate: {
    	type: Date,
    	require: true
    },    

    portfolio: {
        type: Schema.Types.ObjectId,
        ref: 'Portfolio'
    },

    performance: {
        lastUpdated: Date,
        portfolioStats: [PortfolioStats],
        metrics: [PerformanceMetrics]
    },

    stockTransactions: [Transaction],

    adviceTransactions:[{
        date: Date,
        advice: {
            type: Schema.Types.ObjectId,
            ref: 'Advice'
        },
    }],

    portfolioHistory: [{
    	date: Date,
        portfolio: {
            type: Schema.Types.ObjectId,
            ref: 'Portfolio'
        }
    }],

    subscribedAdvices:[{
		type: Schema.Types.ObjectId,
    	ref: 'Advice'
    }],

    subscriptionHistory:[{
    	startDate: Date,
    	endDate: Date, 
    	advice: {
    		type: Schema.Types.ObjectId,
        	ref: 'Advice'
    	}
    }],
   	
    followingAdvices: [{
	    type: Schema.Types.ObjectId,
        ref: 'Advice'
    }],

    followingAdvisors: [{
        type: Schema.Types.ObjectId,
        ref: 'Advisor'
    }],

    /*performanceHistory: [{
    	date: Date,
    	performance: Schema.Types.Mixed,
    	
    }],*/
});

Investor.statics.saveInvestor = function(investorDetails) {
    const investor = new this(investorDetails);
    return investor.save();
};

Investor.statics.getInvestor = function(query, options) {
	
    var q = this.findOne(query)
			.populate('user', 'firstName lastName');

	if(options.fields) {
		options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	if((options.fields && options.fields.indexOf('portfolio')) || !options.fields) {
		q = q.populate('portfolio', null, { _id: { $ne: null }})
	}

	/*if((options.fields && options.fields.indexOf('followingAdvices')) || !options.fields) {
		q = q.populate('followingAdvices', null, { _id: { $ne: null }})
	}

	if((options.fields && options.fields.indexOf('followingAdvisors')) || !options.fields) {
		q = q.populate('followingAdvisors._id', null, { _id: { $ne: null }})
	}*/

	return q.execAsync();
	 	
};

Investor.statics.updateFollowing = function(query, id, type) {
	
	var id = id.toString(); 

    return this.findOne(query)
	    .then(investor => {
	        if (investor) {
	            
	            let array = ''
	            let idx = ''
	            if (type=="advisor"){
	            	array = investor.followingAdvisors;
	            	idx = array.indexOf(id);
	            } else {
	            	array = investor.followingAdvices;
	            	idx = array.indexOf(id);
	            }
	           
	            if(idx == -1) {
	            	//Insert the advisor
	            	array.addToSet(id);
	            } else {
	            	array.pull(id);
            	}
	            	
	        	return investor.save();
	    	}
	        
	    });
};



Investor.statics.updateSubscription = function(query, adviceId) {
	var adviceId = adviceId.toString(); 

    return this.findOne(query)
    .then(investor => {
        if (investor) {

        	//update current subscriptions
        	var idx = investor.subscribedAdvices.indexOf(adviceId);
        	if(idx == -1) {
        		investor.subscribedAdvices.addToSet(adviceId);
        	} else {
        		investor.subscribedAdvices.pull(adviceId);
        	}

        	//update subscription history 
            idx = investor.subscriptionHistory.map(x => x.advice).lastIndexOf(adviceId);
            
            if(idx == -1) {
            	//Insert the advisor
            	investor.subscriptionHistory.addToSet({startDate: new Date(), endDate: farfuture(), advice:adviceId});
            } else {
            	// Get the enddate
            	var endTime = investor.subscriptionHistory[idx].endDate.getTime();
            	// Check if already following
            	if (endTime == farfuture().getTime()) {
            		//Set end date as NOW
            		investor.subscriptionHistory[idx].endDate = new Date();
            	} else {
            		investor.subscriptionHistory.addToSet({startDate: new Date(), endDate: farfuture(), advice:adviceId});
            	}
            }
        
        	return investor.save();
    	}
        
    });
};

Investor.statics.updatePortfolioHistory = function(query, portfolioId) {

};

function farfuture() {
	return new Date(2200, 1, 1);
}

const InvestorModel = mongoose.model('Investor', Investor);
module.exports = InvestorModel;
