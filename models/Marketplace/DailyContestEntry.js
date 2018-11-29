/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:46:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-29 09:39:06
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
	createdDate: {
		type: Date,
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
	modified: {type:Number, default: 0},
	
	nonMarketHoursFlag: {
		type: Boolean,
		default: false
	}
});

const DailyContestEntry = new Schema({  
	advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
	date: Date, //This corresponds to startDate (mapped to end of market close)
	predictions: [Prediction]
});


DailyContestEntry.index({advisor: 1, date:1}, {unique: true});
DailyContestEntry.index({advisor: 1}, {unique: false});

/*Rules
1. Entry Item can be added any day
2. EntryItem = Stock/Target/Direction/StartDate/EndDate
*/

DailyContestEntry.statics.addEntryPredictions = function(query, predictions, options) {
	return this.findOneAndUpdate(query, {$push: {predictions: {$each: predictions}}}, options)
};

DailyContestEntry.statics.fetchEntry = function(query, options) {
	var q = this.findOne(query);
	if (options && options.fields) {
		q = q.select(options.fields);
	}

	return q.execAsync();
};

DailyContestEntry.statics.countEntries = function(query) {
	return this.count(query);
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

    if(options.fields && options.fields.indexOf('advisor') != -1) {
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
	return this.findOne({...query, date: date}, {predictions:1})
	.then(contestEntry => {
		if (contestEntry) {
			var allPredictions = contestEntry.predictions ? contestEntry.predictions.toObject() : [];
			return allPredictions;
		} else {
			return [];
		}
	});
};

DailyContestEntry.statics.fetchEntryPredictionsEndedOnDate = function(query, date) {
	return this.find({
				...query, 
				$or: [
					{'predictions.endDate': date}, 
					{'predictions.success.date': date}
				]
			}, 
			{predictions:1})
	.then(contestEntries => { //[{predictions: []}, {predictions: []}]
		if (contestEntries) {
			var allPredictions = Array.prototype.concat(...contestEntries.map(item => item.predictions ? item.predictions.toObject() : []));
			
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
	return this.find({...query, date: {$lte: date}, 
			'predictions.endDate': {$gte: date}}, {predictions: 1})
	.then(contestEntries => {
		if (contestEntries) {
			var allPredictions = Array.prototype.concat(...contestEntries.map(item => item.predictions ? item.predictions.toObject() : []));
			
			var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;

			if (allPredictions.length > 0 ) {
				return allPredictions.filter(item => {

					//Convert startdate(exact time) to EOD datetime for comparison purposes
					var startDate = DateHelper.getMarketCloseDateTime(DateHelper.getDate(item.startDate));
					
					return !moment(startDate).isAfter(moment(date)) &&  //start is same or before
							!moment(item.endDate).isBefore(moment(date)) && //end is same or after
							(!item.success.status || (item.success.status && !moment(item.success.date).isBefore(moment(date))))
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
   var q = {predictions:{$elemMatch:{'position.security.ticker': prediction.position.security.ticker, 
                endDate: prediction.endDate,
                startDate: prediction.startDate
            }}, date: DateHelper.getMarketCloseDateTime(prediction.startDate)};

	var updates = {
		$set: {
			'predictions.$.success': {
				status: true, 
				date: DateHelper.getMarketCloseDateTime(new Date())
			}
		}
	};

	return this.updateOne({...query, ...q}, updates);
};

//This is not good programming
DailyContestEntry.statics.updatePredictionCallPrice = function(query, prediction, price) {
   	var q = {predictions:{$elemMatch:{'position.security.ticker': prediction.position.security.ticker, 
            	endDate: prediction.endDate,
                startDate: prediction.startDate
            }}, date: DateHelper.getMarketCloseDateTime(prediction.startDate)};

	var updates = {
		$set: {
			'predictions.$.position.avgPrice': price
		}
	};

	return this.updateOne({...query, ...q}, updates);	
};


DailyContestEntry.statics.updatePrediction = function(query, updatedPrediction) {
	var q = {predictions:{$elemMatch:{'position.security.ticker': prediction.position.security.ticker, 
            	endDate: prediction.endDate,
                startDate: prediction.startDate
            }}, date: DateHelper.getMarketCloseDateTime(prediction.startDate)};

	var updates = {
		$set: {
			'predictions.$': updatedPrediction
		}
	};

	return this.updateOne({...query, ...q}, updates);
	
};

const DailyContestEntryModel = mongoose.model('DailyContestEntry', DailyContestEntry);
module.exports = DailyContestEntryModel;
