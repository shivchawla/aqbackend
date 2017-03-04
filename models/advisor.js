/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 12:32:46
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-03 15:49:16
*/
'use strict';

const mongoose = require('./index');
const Schema = mongoose.Schema;
const Performance = require('./Performance');

const Advisor = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },

    startDate: {
    	type:Date,
    	require: true,
    },

    active: {
    	type: Boolean,
    	require: true,
    }, 

    approved :{
		type: Boolean,
    	require: true,
    	default: false,
    },

    advices: [{
		type: Schema.Types.ObjectId,
		ref: 'Advice'
	}],

	deletedAdvices: [{
		type: Schema.Types.ObjectId,
		ref: 'Advice'
	}],

    followers: [{
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Investor'
    }],
       
   	followersHistory: [{
   		startDate: Date,
   		endDate:Date,
   		investor: {
	        type: Schema.Types.ObjectId,
	        require: true,
	        ref: 'Investor'
        },
    }],

    performance: {
    	type: Performance,
    },

    performanceHistory: [{
    	date: Date,
    	performance: Performance
    }],

    rating:{
    	type: Number,
        require: true,
        default: 0
    },

    ratingHistory: [{
    	date: Date,
    	rating: {
    		type: Number,
        	require: true,
        	default: 0
    	}
    }]
});


Advisor.statics.saveAdvisor = function(advisorDetails) {
    const advisor = new this(advisorDetails);
    return advisor.save();
};

//Update the followers list
//Keeps a history of followers
//Adds if not following.
//Updates enddate if already following
/*Advisor.statics.updateFollowers = function(query, investorId) {
 	const investorId = investorId.value;
    
    return this.findOne(query)
    .then(advisor => {
        if (advisor) {
            
            var idx = advisor.followers.map(x => x.user).lasIndexOf(investorId);
            
            if(idx == -1) {
            	//Insert the investor
            	advisor.followers.push({startdate: now(), enddate: farfuture(), investor:investorId});
            } else {
            	// Get the enddate
            	var endTime = advisor.followers[idx].enddate.getTime();
            	// Check if already following
            	if (endTime == farfuture().getTime()) {
            		//Set end date as NOW
            		advisor.followers[idx].enddate = new Date();
            	} else {
            		advisor.followers.push({startdate: now(), enddate: farfuture(), investor:investorId});
            	}
            }
        }
        
        return advisor.save();
        
    });
}*/

//Update the followers list
//Keeps a history of followers
//Adds if not following.
//Updates enddate if already following
Advisor.statics.updateFollowers = function(query, investorId) {
	const id = investorId.toString();

    return this.findOne(query)
    .then(advisor => {
        if (advisor) {
            var idx = advisor.followers.indexOf(id)
           
            if(idx == -1) {
        		advisor.followers.addToSet(id);
            } else {
            	advisor.followers.pull(id);
            }
            
            //Now update history
            var followersHistory = advisor.followersHistory;
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
            }
        
        	return advisor.save();
    	}
        
    });
};

/*Advisor.statics.getFollowers = function(query) {
	return this.find(query)
	.populate('followers.user','firstName lastName')
	.select('followers')
	.execAsync();*/

	/*return this.aggregate([
    	{$match: query},
    	{$project: {
	        followers: {
	        	$filter: {
		            input: '$followers',
		            as: 'item',
		            cond: {$eq: ['$$item.endDate', farfuture().toISOString()]}
	        	}
	        }
    	}
    	}
	])*/
	//.populate('followers.user','firstName lastName')
	//.select('followers')
	//.execAsync()
//}

Advisor.statics.getAllAdvisors = function(query, options) {	
	var q = this.find(query)
				.populate('user', 'firstName lastName');

	if(options.skip){
		q = q.skip(options.skip) 	
	}

	if(options.limit) {
		q = q.limit(options.limit)
	}			
	
	if(options.fields) {
		options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	if((options.fields && options.fields.indexOf('advices')) || !options.fields) {
		q = q.populate('advices._id', null, { _id: { $ne: null }})
	}

	if((options.fields && options.fields.indexOf('followers')) || !options.fields) {
		q = q.populate('followers', 'firstName lastName', { _id: { $ne: null }})
	}

	if((options.fields && options.fields.indexOf('followersHistory')) || !options.fields) {
		q = q.populate('followersHistory.user', 'firstName lastName', { _id: { $ne: null }})
	}

	if(options.sort) {
		options.sort = options.sort.replace(',',' ');
		q = q.sort(options.sort);
	}
	
	return q.execAsync();
};

Advisor.statics.getAdvisor = function(query, options) {
	var q = this.findOne(query)
			.populate('user', 'firstName lastName');

	if(options.fields) {
		options.fields = options.fields.replace(',',' ');
		q = q.select(options.fields);
	}

	if((options.fields && options.fields.indexOf('advices')) || !options.fields) {
		q = q.populate('advices._id', null, { _id: { $ne: null }})
	}
	
	if((options.fields && options.fields.indexOf('followers')) || !options.fields) {
		q = q.populate('followers', 'firstName lastName', { _id: { $ne: null }})
	}

	if((options.fields && options.fields.indexOf('followersHistory')) || !options.fields) {
		q = q.populate('followersHistory.user', 'firstName lastName', { _id: { $ne: null }})
	}

	return q.execAsync();
};

Advisor.statics.addAdvice = function(query, adviceId) {
	return this.findOne(query)
	.populate('user')
	.then((advisor) => {
		if(advisor) {
			advisor.advices.push(adviceId);
		}

		return advisor.save();
	})
	.then(advisor => {
		return {user: advisor.user, advice: advisor.advices};
	})
	
};

Advisor.statics.removeAdvice = function(query, adviceId) {
	return this.findOne(query)
		.then(advisor => {
			if(advisor) {
				advisor.advices.pull(adviceId);
				advisor.deletedAdvices.push(adviceId);
			}

			return advisor.save();
		})	
};

Advisor.statics.updatePerformance = function(query, performance) {
	return this.findOne(query)
		.populate('user')
		.then((advisor) => {
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