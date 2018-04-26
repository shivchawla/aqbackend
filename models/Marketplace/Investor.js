/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:53:13
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-26 23:50:59
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

    profile: Schema.Types.Mixed,

});

Investor.index({user: 1}, {unique: true});

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

Investor.statics.addPortfolio = function(query, portfolioId, setDefault){
    return this.findOne(query)
    .select('portfolios defaultPortfolio')
    .then(investor => {
        if(investor.portfolios) {
            investor.portfolios.push(portfolioId);
        } else {
            investor.portfolios = [portfolioId];
        }

        if (!investor.defaultPortfolio || investor.portfolios.length == 1 || setDefault) {
           investor.defaultPortfolio = portfolioId; 
        }

        return investor.saveAsync();
    });
};

Investor.statics.removePortfolio = function(query, portfolioId){
    return this.findOne(query)
    .select('portfolios defaultPortfolio')
    .then(investor => {
        if(investor.portfolios) {
            var idx = investor.portfolios.map(item => item.toString()).indexOf(portfolioId.toString());
            if(idx != -1) {
                investor.portfolios.splice(idx,1);    
            }

            if (investor.defaultPortfolio.equals(portfolioId)) {
                investor.defaultPortfolio = investor.portfolios.length > 0 ? investor.portfolios[0] : null;
            }
            
            return investor.saveAsync();
        } else {
            return investor;
        } 
    });
};

function farfuture() {
	return new Date(2200, 1, 1);
}

const InvestorModel = mongoose.model('Investor', Investor);
module.exports = InvestorModel;
