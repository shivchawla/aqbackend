/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:46:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-02-22 09:34:44
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
	
	triggered: {
		status: {
			type: Boolean,
			default: true
		},

		date: Date,
		
		trueDate: Date,
	},

	conditional: {
		type: Boolean,
		default: false
	},

	conditionalPrice: Number,

	target: {
		type: Number,
		required: true
	},
	stopLoss: {
		type: Number,
		required: false,
		default: -1, //~ 100%
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
	
	priceInterval: {
		lowPrice: {type:Number, default: Infinity},
		highPrice: {type:Number, default: -Infinity}
	},
	
	status: {
		profitTarget: {type:Boolean, default: false},
		stopLoss: {type: Boolean, default: false},
		manualExit: {type: Boolean, default: false},
		expired: {type: Boolean, default: false},
		date: Date,
		trueDate: Date,
		price: Number
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
DailyContestEntry.index({'predictions.triggered': 1, 'predictions.endDate':1});


/*Rules
1. Entry Item can be added any day
2. EntryItem = Stock/Target/Direction/StartDate/EndDate
*/

DailyContestEntry.statics.addEntryPredictions = function(query, predictions, options) {
	return this.findOneAndUpdate(query, {$addToSet: {predictions: {$each: predictions}}}, options)
};

DailyContestEntry.statics.fetchEntry = function(query, options) {
	var q = this.findOne(query);
	if (options && options.fields) {
		q = q.select(options.fields);
	}

	return q.execAsync();
};

DailyContestEntry.statics.fetchDistinctAdvisors= function(query) {
	return this.distinct('advisor', query);
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


DailyContestEntry.statics.fetchEntryPredictionsStartedOnDate = function(query, date, options) {
	
	//Active has 3 values (false, true, null)
	//Null includes everything
	var active = _.get(options, 'active', true); 

	var q = active == null ? {} : 

				!active ? {$and: [{'predictions.triggered': {$exists: true}}, {'predictions.triggered.status': false}]} :

			{$or:[
				{$and: [
					{'predictions.triggered': {$exists: true}}, 
					{'predictions.triggered.status': true}, 
					{$or: [
						{'predictions.triggered.date': date},
						{'predictions.triggered.date': {$exists: false}}]
					}
				]}, 
				{'predictions.triggered': {$exists: false}}
			]};

	return this.findOne({...query, date: date, ...q}, {predictions:1})
	.then(contestEntry => {
		if (contestEntry) {
			var allPredictions = contestEntry.predictions ? contestEntry.predictions.toObject() : [];
			return allPredictions.filter(item => item);
		} else {
			return [];
		}
	});
};


DailyContestEntry.statics.fetchEntryPredictionsEndedOnDate = function(query, date, options) {
	
	//Active has 3 values (false, true, null)
	//Null includes everything
	var active = _.get(options, 'active', true); 

	var q = active == null ? {} :
				
				!active ? {$and: [{'predictions.triggered': {$exists: true}}, {'predictions.triggered.status': false}]} :

					{$or:[
						{$and: [{'predictions.triggered': {$exists: true}}, {'predictions.triggered.status': true}]}, 
						{'predictions.triggered': {$exists: false}}
					]};

	return this.find({
				...query, 
				...q, 
				$or: [{'predictions.endDate': date}, 
					{'predictions.status.date': date}]
			}, {predictions:1})
	.then(contestEntries => { //[{predictions: []}, {predictions: []}]
		if (contestEntries) {
			var allPredictions = Array.prototype.concat(...contestEntries.map(item => item.predictions ? item.predictions.toObject() : []));
			
			if (allPredictions.length > 0 ) {
				return allPredictions.filter(item => item).filter(item => {
					//Convert the date to market-close date time 
					//(relevant for date today because input is true time) 
					var successFailureStatus = item.status.profitTarget || item.status.stopLoss || item.status.manualExit;

					return (moment(item.endDate).isSame(moment(date)) && !successFailureStatus) || 
					(successFailureStatus && moment(item.status.date).isSame(moment(date)))
				});
			} else {
				return [];
			}
		} else {
			return [];
		}
	});						
};


/*
* Return ALL predictions active on that date (including ended/started/active)
*/
DailyContestEntry.statics.fetchEntryPredictionsOnDate = function(query, date, options) {

	//Active has 3 values (false, true, null)
	//Null includes everything
	var active = _.get(options, 'active', true); 

	var q = active == null ? 
				
				{} : 

				!active  ?  {$and: [{'predictions.triggered': {$exists: true}}, {'predictions.triggered.status': false}]} :
				
				{$or:[
					{$and: [
						{'predictions.triggered': {$exists: true}}, 
						{'predictions.triggered.status': true}, 
						{$or: [
							{'predictions.triggered.date': {$lte: date}},
							{'predictions.triggered.date': {$exists: false}}]
						}
					]}, 
					{'predictions.triggered': {$exists: false}}
				]};


	return this.find({...query, date: {$lte: date}, ...q,
			'predictions.endDate': {$gte: date}}, {predictions: 1})
	.then(contestEntries => {
		if (contestEntries) {
			var allPredictions = Array.prototype.concat(...contestEntries.map(item => item.predictions ? item.predictions.toObject() : []));
			
			var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;

			if (allPredictions.length > 0 ) {
				return allPredictions.filter(item => item).filter(item => {

					//Convert startdate(exact time) to EOD datetime for comparison purposes
					var startDate = DateHelper.getMarketCloseDateTime(DateHelper.getDate(item.startDate));
					var successFailureStatus = item.status.profitTarget || item.status.stopLoss || item.status.manualExit;
					
					return !moment(startDate).isAfter(moment(date)) &&  //start is same or before
							!moment(item.endDate).isBefore(moment(date)) && //end is same or after
							(!successFailureStatus || (successFailureStatus && !moment(item.status.date).isBefore(moment(date))))
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
DailyContestEntry.statics.updatePredictionCallPrice = function(query, prediction, price) {
   	var q = {predictions:{$elemMatch:{'position.security.ticker': prediction.position.security.ticker, 
                createdDate: prediction.createdDate,
                _id: prediction._id,
            }}, date: DateHelper.getMarketCloseDateTime(prediction.startDate)};

	var updates = {
		$set: {
			'predictions.$.position.avgPrice': price
		}
	};

	return this.updateOne({...query, ...q}, updates);	
};


//THIS IS IN USE
DailyContestEntry.statics.updatePrediction = function(query, updatedPrediction) {
	var q = {predictions:{$elemMatch:{'position.security.ticker': updatedPrediction.position.security.ticker, 
                createdDate: updatedPrediction.createdDate,
                _id: updatedPrediction._id,
            }}, date: DateHelper.getMarketCloseDateTime(updatedPrediction.startDate)};

	var updates = {
		$set: {
			'predictions.$': updatedPrediction
		}
	};

	return this.updateOne({...query, ...q}, updates);
	
};

const DailyContestEntryModel = mongoose.model('DailyContestEntry', DailyContestEntry);
module.exports = DailyContestEntryModel;
