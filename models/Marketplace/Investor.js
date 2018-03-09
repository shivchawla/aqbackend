/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:53:13
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-09 16:08:57
*/

'use strict';

const mongoose = require('../index');
const Schema = mongoose.Schema;

const Portfolio = require('./Portfolio');
const Advice = require('./Advice');

const Investor = new Schema({
    
    user: {
        type: Schema.Types.ObjectId,
        ref:'User',
        required: true
    },

    defaultPortfolio: {
        type: Schema.Types.ObjectId,
        ref: 'Portfolio'
    },

    portfolios: [{
        type: Schema.Types.ObjectId,
        ref: 'Portfolio'
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

    profile: Schema.Types.Mixed,

    invitationsFromAdvice: [{
        accept: {
            type: Boolean,
            default: false
        },

        reject: {
            type: Boolean,
            default: false
        },
        
        advice: {
            type: Schema.Types.ObjectId,
            ref:'Advice',
            required: true 
        }
    }],
});

Investor.statics.saveInvestor = function(investorDetails) {
    const investor = new this(investorDetails);
    return investor.saveAsync();
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
};

Investor.statics.updateInvestor = function(query, updates) {
    
    return this.findOneAndUpdate(query, updates);
};

Investor.statics.updateFollowing = function(query, id, type) {
	
    return this.findOne(query, {followingAdvisors:1, followingAdvices:1})
    .then(investor => {
        if (investor) {

            let array = '';
            let idx = '';
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
            	
        	return investor.saveAsync();
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
                
            return investor.saveAsync();
        }
    });
};

Investor.statics.addPortfolio = function(query, portfolioId){
    return this.findOne(query)
    .select('portfolios')
    .then(investor => {
        if(investor.portfolios) {
            investor.portfolios.push(portfolioId);
        } else {
            investor.portfolios = [portfolioId];
        }

        if (!investor.defaultPortfolio || investor.portfolios.length == 1) {
           investor.defaultPortfolio = portfolioId; 
        }

        return investor.saveAsync();
    });
};

Investor.statics.acceptInvitationFromAdvice = function(query, adviceId) {
    return this.findOne(query).select('invitationsFromAdvice')
    .then(investor => {
        var allInvitations = investor.invitationsFromAdvice;
        var invitedAdvices = allInvitations ? allInvitations.map(item => item.advice) : [];
        
        var idx = invitedAdvices ? invitedAdvices.map(item => item.toString()).indexOf(adviceId.toString()) : -1;
        if(idx !=-1) {
            investor.invitationsFromAdvice[idx].accept = true;
            advice.invitationsFromAdvice[idx].reject = false;
            return investor.saveAsync();
        } else {
            throw new Error("No Invitation found");
        }
    })
    .then(investor => {
        return null;
    }); 
};

Investor.statics.rejectInvitationFromAdvice = function(query, adviceId) {
    return this.findOne(query).select('invitationsFromAdvice')
    .then(investor => {
        var allInvitations = investor.invitationsFromAdvice;
        var invitedAdvices = allInvitations ? allInvitations.map(item => item.advice) : [];
        
        var idx = invitedAdvices ? invitedAdvices.map(item => item.toString()).indexOf(adviceId.toString()) : -1;
        if(idx !=-1) {
            investor.invitationsFromAdvice[idx].accept = false;
            advice.invitationsFromAdvice[idx].reject = true;
            return investor.saveAsync();
        } else {
            throw new Error("No Invitation found");
        }
    })
    .then(investor => {
        return null;
    }); 
};

Investor.statics.addAdviceInvite = function(query, adviceId) {
    return this.findOne(query).select('invitationsFromAdvice')
    .then(investor => {
        var allInvitations = investor.invitationsFromAdvice;
        var invitedAdvices = allInvitations ? allInvitations.map(item => item.advice) : [];
        var idx = invitedAdvices ? invitedAdvices.map(item => item.toString()).indexOf(adviceId.toString()) : -1;
        
        if(idx == -1) {     
            invitationsFromAdvice.push({accept: false, reject: false, advice: adviceId});
        } else {
            var reject = invitationsFromAdvice[idx].reject;

            if(reject) {
                throw new Error("Already rejected");            
            }

            throw new Error("Invitation already present");            

        }
        
    })
    .then(advice => {
        return null;
    }) 
};


function farfuture() {

	return new Date(2200, 1, 1);
}

const InvestorModel = mongoose.model('Investor', Investor);
module.exports = InvestorModel;
