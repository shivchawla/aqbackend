/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 12:32:46
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-15 12:42:15
*/
'use strict';

const mongoose = require('../index');
const Schema = mongoose.Schema;

const Performance = require('./Performance');
const Investor = require('./Investor');

const Advisor = new Schema({
   	user: {
        type: Schema.Types.ObjectId,
        ref:'User',
        required: true
    },

    approved: {
		type: Boolean,
    	required: true,
    	default: false,
    },

    approvedDate: Date,  

    followers: [{
    	investor: {
	        type: Schema.Types.ObjectId,
	        ref: 'Investor'
        },

        active: {
        	type: Boolean,
        	default: true,
        },

        updatedDate: Date
    }],
       
    rating: [{
    	date: Date,
    	rating: {
    		type: Number,
        	default: 0
    	}
    }],

    profile: Schema.Types.Mixed,
});


Advisor.statics.saveAdvisor = function(advisorDetail) {
    const advisor = new this(advisorDetail);
    return advisor.save();
};

//Update the followers list
//Keeps a history of followers
//Adds if not following.
//Updates enddate if already following
Advisor.statics.updateFollowers = function(query, userId) {
	const id = userId.toString();

    return this.findOne(query)
    .then(advisor => {
        if (advisor) {
            var idx = advisor.followers.indexOf(id)
           
            if(idx == -1) {
        		advisor.followers.addToSet({user: id, updatedDate:new Date()});
            } else {
            	advisor.followers[idx].active = false;
            	advisor.followers[idx].updatedDate = new Date();
            }
            
            //Now update history
            /*var followersHistory = advisor.followersHistory;
            idx = followersHistory.map(x => x.investor.toString()).lastIndexOf(id);
            
            if(idx == -1) {
            	//Insert the investor
            	followersHistory.addToSet({startDate: new Date(), endDate: farfuture(), investor:id});
            } else {
            	// Get the enddate
            	var endTime = followersHistory[idx].endDate.getTime();
            	// Check if already following
            	if (endTime == farfuture().getTime()) {
            		//Set end date as NOW
            		followersHistory[idx].endDate = new Date();
            	} else {
            		followersHistory.addToSet({startDate: new Date(), endDate: farfuture(), investor:id});
            	}
            }*/
        
        	return advisor.save();
    	}
        
    });
};

Advisor.statics.fetchAdvisors = function(query, options) {	
	var q = this.find(query)
				.populate('user', 'firstName lastName');

	console.log(options);

	if(options.skip) {
		q = q.skip(options.skip) 	
	}

	if(options.limit) {
		q = q.limit(options.limit)
	}			
	
	if(options.fields) {
		//options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	if((options.fields && options.fields.indexOf('advices')) || !options.fields) {
		q = q.populate('advices', null, { _id: { $ne: null }})
	}

	if((options.fields && options.fields.indexOf('followers')) || !options.fields) {
		q = q.populate('followers.user', 'firstName lastName', { _id: { $ne: null }})
	}

	if(options.sort) {
		options.sort = options.sort.replace(',',' ');
		q = q.sort(options.sort);
	}
	
	return q.execAsync();
};

Advisor.statics.fetchAdvisor = function(query, options) {
	//FETCH creates a new document with default if insert is TRUE
	var q = this.findOneAndUpdate(query, {}, {upsert: options.insert, new: options.insert, setDefaultsOnInsert: options.insert})
			.populate('user', 'firstName lastName');

	if(options.fields) {
		//options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	if((options.fields && options.fields.indexOf('advices')) || !options.fields) {
		q = q.populate('advices._id', null, { _id: { $ne: null }})
	}
	
	if((options.fields && options.fields.indexOf('followers')) || !options.fields) {
		q = q.populate('followers.user', 'firstName lastName', { _id: { $ne: null }})
	}

	return q.execAsync();
};

Advisor.statics.addAdvice = function(query, adviceId) {
	return this.findOne(query)
	.select('advices')
	.then(advisor => {
		if(advisor) {
			advisor.advices.push(adviceId);
		}

		return advisor.save();
	});
	/*.then(advisor => {
		return {addedAdvice: adviceId, advices: advisor.advices};
	})*/
	
};

Advisor.statics.removeAdvice = function(query, adviceId) {
	return this.findOne(query)
	.then(advisor => {
		if(advisor) {
			advisor.advices.pull(adviceId);
			return advisor.save();
		} else {
			throw new Error("Advisor not found. Advice can't be removed");
		}
	});
};

Advisor.statics.updatePerformance = function(query, performance) {
	return this.findOne(query)
		.populate('user')
		.then(advisor => {
			if(advisor) {
				var histPerformance = advisor.currentPerformance;
				
				if(histPerformance) {
					advisor.performance.push(histPerformance);
				}

				advisor.currentPerformance = histPerformance;
			}

			return advisor.save();
		})
		.then(advisor => {
			return {user: advisor.user, performance: advisor.currentPerformance};
		})
};

Advisor.statics.updateRating = function(query, rating) {
	return this.find(query)
		.then((advisor) => {
			if(advisor) {
				advisor.rating = rating;
				return advisor.save();
			}
		})
		.then(advisor => {
			return {user: advisor.user, rating: advisor.rating};
		});
};

function getTime(d) {
	return d.getTime();
}

function farfuture() {
	return new Date(2200, 1, 1);
}

function lessthan(d1, d2) {
	return d1.getTime() < d2.getTime();
}

const AdvisorModel = mongoose.model('Advisor', Advisor);
module.exports = AdvisorModel;
