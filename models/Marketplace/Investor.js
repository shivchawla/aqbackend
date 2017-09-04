/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:53:13
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-09-04 12:39:37
*/

'use strict';

const mongoose = require('../index');
const Schema = mongoose.Schema;

const Portfolio = require('./Portfolio');
const Transaction = require('./Transaction');
const Performance = require('./Performance');
const Advice = require('./Advice');

const Investor = new Schema({
    
    user: {
        type: Schema.Types.ObjectId,
        ref:'User',
    },

    defaultPortfolio: {
        type: Schema.Types.ObjectId,
        ref: 'Portfolio'
    },

    portfolios: [{
        type: Schema.Types.ObjectId,
        ref: 'Portfolio'
    }],

    performance: [{
        portfolio: {
            type: Schema.Types.ObjectId,
            ref: 'Portfolio'
        },

        value: Performance
    }],

    subscribedAdvices:[{
        advice: {
	       type: Schema.Types.ObjectId,
	       ref: 'Advice'
       },

       updatedDate: Date,

       active: {
            type: Boolean,
            default: true,
       }
    }],
   	
    followingAdvices: [{

        advice: {
	       type: Schema.Types.ObjectId,
            ref: 'Advice'
        },

        updatedDate: Date,

        active: {
            type: Boolean,
            default: true,
       }

    }],

    followingAdvisors: [{

        advisor: {
            type: Schema.Types.ObjectId,
            ref: 'Advisor'
        },

        updatedDate: Date,

        active: {
            type: Boolean,
            default: true,
        }
    }],

});

/*Investor.statics.saveInvestor = function(investorDetails) {
    const investor = new this(investorDetails);
    return investor.save();
};*/

Investor.statics.saveInvestor = function(investorDetails) {
    const investor = new this(investorDetails);
    return investor.save();
};

Investor.statics.fetchInvestor = function(query, options) {
	console.log(options);
    console.log(options.fields);
    var q = this.findOne(query);
			
	if(options.fields) {   
		q = q.select(options.fields);
	}
    console.log(options.fields);

    if((options.fields && options.fields.indexOf('defaultPortfolio')) || !options.fields) {
        q = q.populate('defaultPortfolio', null, { _id: { $ne: null }});
    }

	/*if((options.fields && options.fields.indexOf('portfolios')) || !options.fields) {
		q = q.populate('portfolios', null, { _id: { $ne: null }});
	}*/

	if((options.fields && options.fields.indexOf('followingAdvices')) || !options.fields) {
		q = q.populate('followingAdvices', null, { _id: { $ne: null }})
	}

	if((options.fields && options.fields.indexOf('followingAdvisors')) || !options.fields) {
		q = q.populate('followingAdvisors', null, { _id: { $ne: null }})
	}

    console.log("end");

    //console.log(q);
	return q.execAsync();
	 	
};

Investor.statics.updateInvestorPerformance = function(query, portfolioId, performance) {
    return this.findOne(query)
    .then(investor => {
        var idx = investor.performance.map(item => item.portfolio.valueOf()).indexOf(portfolioId);
        if(idx !=-1) {
            investor.performance[idx].value = performance;
        } else {
            investor.performance.push({portfolio: portfolioId, value: performance});
        }

        console.log("Saving Investor");
        return investor.save();
    });
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

Investor.statics.updatePortfolioHistory = function(query, portfolioId, cloneId) {
    return this.findOne(query)
    .select('historicalPortfolio')
    .then(investor => {
        
        if(investor && investor.historicalPortfolio) {
            var idx = investor.historicalPortfolio.map(item =>item.refPortfolio).equals(portfolioId)
            if(idx !=- 1) {
                investor.historicalPortfolio[idx].history.push(cloneId);
            }
        }

        return investor.save();
        
    });
};

Investor.statics.addTransactions = function(query, transactions) {
    this.findOne(query)
    .select('transactions')
    .then(investor => {
        if(investor && investor.transactions) {
            transactions.forEach(transaction => {
                //transaction["portfolio"] = portfolioId;
                investor.transactions.push(transaction);
            })
        }

        return investor.save();
    });
};

Investor.statics.addAdviceTransactions = function(query, adviceId) {
    return this.findOne(query)
    .select('adviceTransactions')
    .then(investor => {
        if(investor && investor.adviceTransactions) {
            
            var idx = adviceTransactions.indexOf(item => {item.advice.equals(adviceId)});
            
            if(idx == -1) {
                investor.adviceTransactions.push({date: new Date, advice: adviceId});
            }
        }

        return investor.save();
    });
};

Investor.statics.addPortfolio = function(query, portfolioId){
    return this.findOne(query)
    .select('portfolios')
    .then(investor => {
        if(investor.portfolios) {
            investor.portfolios.push(portfolioId);
        } else {
            investor.defaultPortfolio = portfolioId;
            investor.portfolios = [portfolioId];
        }
        return investor.save();
    });
};

Investor.statics.removePortfolio = function(query, portfolioId){
    return this.findOne(query)
    .select('portfolios')
    .then(investor => {
        investor.portfolios.splice(portfolioId, 1);
        return investor.save();
    });
};

function farfuture() {
	return new Date(2200, 1, 1);
}

const InvestorModel = mongoose.model('Investor', Investor);
module.exports = InvestorModel;
