/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:46:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-31 11:25:14
*/


'use strict';
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const moment = require('moment');

const DateHelper = require('../../utils/Date');
const Schema = mongoose.Schema;

const Security = require('./Security');
const DollarPosition = require('./DollarPosition');

const dateFormat = 'YYYY-MM-DD';

const RatingDetail = new Schema({
    value: Number,
    rank: Number,
    detail: [{field: String, ratingValue: Number, rank: Number, metricValue: Number}],
});

const Rank = new Schema({
    value: Number,
    date: Date,
    rating: {current: RatingDetail, simulated: RatingDetail}
});

const Prize = new Schema({
    rank: {
        type: Number,
        required: true
    },
    value: {
        type: Number,
        required: true
    }
});

const Prediction = new Schema({
	position: {
		type: DollarPosition,
		required: true
	},
	target: {
		type: Number,
		required: true
	},
	endDate: {
		type: Date,
		required: true
	},
	startDate: {
		type: Date,
		required: true
	},
	success: {
		status: {type: Boolean, default: false},
		date: Date
	},
	modified: {type:Number, default: 0}
});

const DailyContestEntry = new Schema({  
	advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
	
	createdDate: Date,
	
	updatedDate: Date,

	predictions: [Prediction]
});

/*Rules
1. Entry Item can be added any day
2. EntryItem = Stock/Target/Direction/StartDate/EndDate
*/

DailyContestEntry.statics.createEntry = function(contestEntry) {
    const dailyContestEntry = new this(contestEntry);
    return dailyContestEntry.saveAsync();
}

DailyContestEntry.statics.addEntryPredictions = function(query, predictions, options) {
	return this.findOneAndUpdate(query, {$push: {predictions: {$each: predictions}}}, options)
};

DailyContestEntry.statics.updateEntryPredictions = function(query, predictions, date, options) {
	
	let updateOne = {
		updatedDate: new Date(),
		$pull: {predictions:{startDate: date}}
	};

	let updateTwo = {
		updatedDate: new Date(),
	 	$push: {predictions: {$each: predictions}}
	};

	return this.findOneAndUpdateAsync(query, updateOne)
	.then(() => {
		return this.findOneAndUpdateAsync(query, updateTwo);
	});
};

DailyContestEntry.statics.fetchEntry = function(query, options) {
	var q = this.findOne(query);
	if (options && options.fields) {
		q = q.select(options.fields);
	}

	return q.execAsync();
};

DailyContestEntry.statics.fetchEntries = function(query, options) {
	var q = this.find(query);

	if(options.skip) {
        q = q.skip(options.skip)    
    }

    if(options.limit) {
        q = q.limit(options.limit)
    }           
    
	if(options.fields) {
        q = q.select(options.fields);
	}

    if(options.populate && options.populate.indexOf('advisor') != -1) {
        q = q.select('advisor').populate({path:'advisor', select:'user _id',
                                        populate:{path: 'user', 
                                            select:'_id firstName lastName'}
                                });
    }
	
    if (options.orderParam && options.order) {
        q = q.sort({[options.orderParam]: options.order});
    }

    return q.execAsync();
};

DailyContestEntry.statics.fetchEntryPredictionsStartedOnDate = function(query, date) {
	return this.findOne(query, {predictions:1})
	.then(contestEntry => {
		if (contestEntry) {
			var allPredictions = contestEntry.predictions ? contestEntry.predictions.toObject() : [];
			if (allPredictions.length > 0 ) {
				//Convert the date to market-close date time 
				//(relevant for date today because input is true time) 
				return allPredictions.filter(item => {
					//Convert startdate(exact time) to EOD datetime for comparison purposes
					
					var startDate = DateHelper.getMarketCloseDateTime(DateHelper.getDate(item.startDate));
					return moment(startDate).isSame(moment(date))
				});
			} else {
				return [];
			}
		} else {
			return [];
		}
	});
};

DailyContestEntry.statics.fetchEntryPredictionsEndedOnDate = function(query, date) {
	return this.findOne(query, {predictions:1})
	.then(contestEntry => {
		if (contestEntry) {
			var allPredictions = contestEntry.predictions ? contestEntry.predictions.toObject() : [];
			if (allPredictions.length > 0 ) {
				return allPredictions.filter(item => {
					//Convert the date to market-close date time 
					//(relevant for date today because input is true time) 
					return (moment(item.endDate).isSame(moment(date)) && !item.success.status) || 
					(item.success.status && moment(item.success.date).isSame(moment(date)))
				});
			} else {
				return [];
			}
		} else {
			return [];
		}
	});						
};

DailyContestEntry.statics.fetchEntryPredictionsActiveOnDate = function(query, date) {
	return this.findOne(query, {predictions: 1})
	.then(contestEntry => {
		if (contestEntry) {
			var allPredictions = contestEntry.predictions ? contestEntry.predictions.toObject() : [];
			
			var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;

			if (allPredictions.length > 0 ) {
				return allPredictions.filter(item => {

					//Convert startdate(exact time) to EOD datetime for comparison purposes
					var startDate = DateHelper.getMarketCloseDateTime(DateHelper.getDate(item.startDate));
					
					return !moment(startDate).isAfter(moment(date)) && 
							(moment(item.endDate).isAfter(moment(date)) || (isToday && moment(item.endDate).isAfter(moment())))
							!item.success.status 
				});
			} else {
				return [];
			}
		} else {
			return [];
		}
	});
};


//This is not good programming
DailyContestEntry.statics.updatePredictionStatus = function(query, prediction) {
	var q = {'predictions.position.security.ticker': prediction.position.security.ticker, 
				'predictions.endDate': prediction.endDate,
				'predictions.startDate': prediction.startDate
			};
	var updates = {
		$set: {
			'predictions.$.success': {
				status: true, 
				date: DateHelper.getMarketCloseDateTime(new Date())
			}
		}
	};

	return this.findOneAndUpdate({...query, ...q}, updates);
};


//This is not good programming
DailyContestEntry.statics.updatePredictionCallPrice = function(query, prediction, price) {
	var q = {'predictions.position.security.ticker': prediction.position.security.ticker, 
			'predictions.endDate': prediction.endDate,
			'predictions.startDate': prediction.startDate
		};

	var updates = {
		$set: {
			'predictions.$.position.avgPrice': price
		}
	};

	return this.findOneAndUpdate({...query, ...q}, updates);
};

const DailyContestEntryModel = mongoose.model('DailyContestEntry', DailyContestEntry);
module.exports = DailyContestEntryModel;
