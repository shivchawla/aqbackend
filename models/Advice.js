/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:09:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-05 00:07:51
*/
'use strict';

const Portfolio = require('./Portfolio')
const Performance = require('./Performance')
const Promise = require('bluebird');

const mongoose = require('./index');
const Schema = mongoose.Schema;
const Advice = new Schema({

	advisor: {
    	type: Schema.Types.ObjectId,
        require: true,
        ref: 'Advisor'
    },

	adviceHistory:[{
		date: Date,
		advice: {
			type: Schema.Types.ObjectId,
        	require: true,
        	ref: 'Advice'	
		}
	}],

    portfolio: {
        type: Portfolio,
        require: true,
    },

    createdDate:{
    	type: Date,
    	require: true,
    },

    updatedDate:{
    	type: Date,
    	require: true,
    },

    startDate: {
    	type: Date,
    	require: true,
	},

    endDate: {
    	type: Date,
    	require: true,
    },

    deleted: {
    	type: Boolean,
    	default: false,
    },

    deletedDate:{
    	type: Date,
    },

    performance: [{
    	date:Date,
    	value: Performance,
    }],

    rating: {
    	value: Number,
    	default: 0,
    },

    ratingHistory:[{
    	date: Date,
	 	value: Number,
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

    subscribers: [{
	    type: Schema.Types.ObjectId,
        require: true,
        ref: 'Investor'
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
                
            	//Copy the advice 
                const copy = new this(advice);
                copy._id = mongoose.Types.ObjectId();
                copy.isNew =  true;
                copy.adviceHistory = [];

                return Promise.all([copy.save(), advice]);
            }
        })
    	.then(([savedCopy, advice]) => {
    		if(savedCopy && advice) {
	            advice.adviceHistory.push(savedCopy._id);
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
            
            /*var idx = advice.followers.map(x => x.investor).lastIndexOf(investorId);
            
            if(idx == -1) {
            	//Insert the investor
            	advice.followers.push({startdate: new Date(), enddate: farfuture(), investor:investorId});
            } else {
            	// Get the enddate
            	var endTime = advice.followers[idx].enddate.getTime();
            	// Check if already following
            	if (endTime == farfuture().getTime()) {
            		//Set end date as NOW
            		advice.followers[idx].enddate = new Date();
            	} else {
            		advice.followers.push({startdate: new Date(), enddate: farfuture(), investor:investorId});
            	}
            }
        }
        
        return advice.save();*/
        
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
