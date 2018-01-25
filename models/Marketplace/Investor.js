/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:53:13
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-25 12:51:40
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

    /*performance: [{
        portfolio: {
            type: Schema.Types.ObjectId,
            ref: 'Portfolio'
        },

        value: Performance
    }],*/

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

    profile: Schema.Types.Mixed,

});

Investor.statics.saveInvestor = function(investorDetails) {
    const investor = new this(investorDetails);
    return investor.save();
};

Investor.statics.fetchInvestor = function(query, options) {
	//FETCH creates a new document with default if insert is TRUE
    var q = this.findOneAndUpdate(query, {}, {upsert: options.insert, new: options.insert, setDefaultsOnInsert: options.insert});

	if (!options.fields) {
        options.fields = '';
    }

    if (!options.populate) {
        options.populate = '';
    }

    if(options.fields) {   
		q = q.select(options.fields);
	}
   
    if(options.populate.indexOf('defaultPortfolio') != -1) {
        q = q.populate('defaultPortfolio', 'name detail benchmark deleted', { _id: { $ne: null }});
    }

	if(options.populate.indexOf('followingAdvices') != -1) {
		q = q.populate('followingAdvices', null, { _id: { $ne: null }})
	}

	if(options.populate.indexOf('followingAdvisors') != -1) {
		q = q.populate('followingAdvisors', null, { _id: { $ne: null }})
	}

	return q.execAsync();
    /*.then(investor => {
        if(investor) {
            if (investor.followingAdvices) {
                investor.followingAdvices = investor.followingAdvices.filter(item => {
                    return item.active == true;
                });
            }

            if (investor.followingAdvisors) {
                investor.followingAdvisors = investor.followingAdvisors.filter(item => {
                    return item.active == true;
                });
            }

            return investor;
        }
    });*/
};

Investor.statics.updateInvestorPerformance = function(query, portfolioId, performance) {
    return this.findOne(query)
    .then(investor => {
        var idx = investor.performance.map(item => item.portfolio.toString()).indexOf(portfolioId);
        if(idx !=-1) {
            investor.performance[idx].value = performance;
        } else {
            investor.performance.push({portfolio: portfolioId, value: performance});
        }

        return investor.save();
    });
};

Investor.statics.updateFollowing = function(query, id, type) {
	
    return this.findOne(query, {followingAdvisors:1, followingAdvices:1})
    .then(investor => {
        if (investor) {

            let array = ''
            let idx = ''
            if (type=="advisor") {
            	array = investor.followingAdvisors;
            	idx = array.map(item => item.advisor.toString()).indexOf(id.toString());
            } else {
            	array = investor.followingAdvices;
            	idx = array.map(item => item.advice.toString()).indexOf(id.toString());
            }
           
            if(idx == -1) {
                if (type=="advisor") {
                    array.addToSet({advisor: id, active: true, updatedDate: new Date()});
                } else {
                    array.addToSet({advice: id, active: true, updatedDate: new Date()});
                }
            } else {
            	array[idx].active = !array[idx].active;
                array[idx].updatedDate = new Date();
        	}
            	
        	return investor.save();
    	}
    });
};

Investor.statics.updateSubscription = function(query, adviceId) {
	var adviceId = adviceId.toString(); 

    return this.findOne(query, {subscribedAdvices: 1})
    .then(investor => {
        if (investor) {
            
            var array = investor.subscribedAdvices;
            var idx = array.map(item => item.advice.toString()).indexOf(adviceId);
           
            if(idx == -1) {
                array.addToSet({advice: adviceId, active: true, updatedDate: new Date()});
            } else {
                array[idx].active = !array[idx].active;
                array[idx].updatedDate = new Date();
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
            if (investor.portfolios.length == 0) {
               investor.defaultPortfolio = portfolioId; 
            }
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
