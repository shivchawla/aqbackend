/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 18:46:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-10 08:52:20
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

const TradeActivity = new Schema({
	date: Date,
	direction: String,
	quantty: Number,
	price: Number,
	automated: Boolean,
	brokerMessage: Schema.Types.Mixed,
	notes: String		
});

const OrderActivity = new Schema({
	date: Date,
	automated: Boolean,
	brokerMessage: Schema.Types.Mixed,
	orderId: String,
});

const AdminActivity = new Schema({
	date: {
		type: Date,
		default: new Date()
	},
	message: String,
	activityType: {
		type: String,
		enum:['ORDER', 'SKIP', 'CANCEL'],
	},
	obj: Schema.Types.Mixed
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

	conditionalType: String,

	real: {
		type: Boolean,
		default: false,
	},

	target: {
		type: Number,
		required: true
	},
	stopLoss: {
		type: Number,
		required: false,
	},

	stopLossType: String,

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
	},

	tradeActivity: [TradeActivity],

	orderActivity: [OrderActivity],

	adminActivity: [AdminActivity],

	skippedByAdmin: {
		type: Boolean,
		default: false
	},

	readStatus: {
		type: String,
		default: "UNREAD"
	},

	adminModifications: [Schema.Types.Mixed],

	atr: {
		latest: {type: Number, default: 0},
		average: {type: Number, default: 0}
	}
});

const DailyContestEntry = new Schema({  
	advisor: {type: Schema.Types.ObjectId, ref: 'Advisor'},
	date: Date, //This corresponds to startDate (mapped to end of market close)
	predictions: [Prediction]
});


DailyContestEntry.index({advisor: 1, date:1}, {unique: true});
DailyContestEntry.index({advisor: 1}, {unique: false});
DailyContestEntry.index({advisor:1, 'predictions._id':1})


/*Rules
1. Entry Item can be added any day
2. EntryItem = Stock/Target/Direction/StartDate/EndDate
*/

DailyContestEntry.statics.addEntryPrediction = function(query, prediction, options) {
	return this.findOneAndUpdate(query, {$addToSet: {predictions: prediction}}, options)
};

DailyContestEntry.statics.fetchPredictionById = function(query, predictionId) {
	return this.findOne({...query, predictions:{$elemMatch: {_id: predictionId}}})
	.then(contestEntry => {
		if (contestEntry) {
			var predictionIds = contestEntry.predictions.map(item => item._id.toString());
			
			var idx = predictionIds.indexOf(predictionId);

			if (idx != -1) {
				return contestEntry.predictions[idx];
			}

		} 
	})
}

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
	
	//Active/Real have 3 values (false, true, null)
	//Null includes everything
	var active = _.get(options, 'active', true); 
	// var real = _.get(options, 'real', null);

	return this.findOne({...query, date: date}, {predictions:1})
	.then(contestEntry => {
		if (contestEntry) {
			var allPredictions = contestEntry.predictions ? contestEntry.predictions.toObject() : [];
			return allPredictions.filter(item => item).filter(item => {
				var _triggered = _.get(item, 'triggered.status', true);
				var triggeredDate = _.get(item, 'triggered.date', null);

				var triggered = _triggered && (!triggeredDate || !moment(triggeredDate).isAfter(date));

				var isActivePrediction = triggered;
				var isInactivePrediction = !triggered;

				return active == null ? isActivePrediction || isInactivePrediction : 
					!active ? isInactivePrediction : isActivePrediction;

				// var isRealPrediction = _.get(item, 'real', false);

				// return !real ? activeFilterSubset : 
				// 			real ? activeFilterSubset && isRealPrediction : 
				// 			activeFilterSubset && !isRealPrediction;

			});
		} else {
			return [];
		}
	});
};


DailyContestEntry.statics.fetchEntryPredictionsEndedOnDate = function(query, date, options) {
	
	//Active/Real have 3 values (false, true, null)
	//Null includes everything
	var active = _.get(options, 'active', true); 
	// var real = _.get(options, 'real', null);

	return this.find({
				...query, 
				$or: [{'predictions.endDate': date}, 
					{'predictions.status.date': date}]
			}, {predictions:1})
	.then(contestEntries => { 
		if (contestEntries) {
			var allPredictions = Array.prototype.concat(...contestEntries.map(item => item.predictions ? item.predictions.toObject() : []));
			
			if (allPredictions.length > 0 ) {
				return allPredictions.filter(item => item).filter(item => {
					//Convert the date to market-close date time 
					//(relevant for date today because input is true time) 
					var successFailureStatus = item.status.profitTarget || item.status.stopLoss || item.status.manualExit;
					var manualExit  = item.status.manualExit;

					var dateCondition = moment(item.endDate).isSame(moment(date));

					var _triggered = _.get(item, 'triggered.status', true);
					var triggeredDate = _.get(item, 'triggered.date', null);

					var triggered = _triggered && (!triggeredDate || !moment(triggeredDate).isAfter(date));

					//
					//If not success and ended in time
					//or success and ended before time
					var isActivePrediction = triggered && ((!successFailureStatus && dateCondition) || 
						(successFailureStatus && moment(item.status.date).isSame(moment(date))));

					var isInactivePrediction = !triggered && ((!manualExit && dateCondition) ||
						(manualExit && moment(item.status.date).isSame(moment(date))));

					return active == null ? isActivePrediction || isInactivePrediction :
						!active ? isInactivePrediction : isActivePrediction;

					// var isRealPrediction = _.get(item, 'real', false);

					// return !real ? activeFilterSubset : 
					// 			real ? activeFilterSubset && isRealPrediction : 
					// 			activeFilterSubset && !isRealPrediction;


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

	//Active/Real have 3 values (false, true, null)
	//Null includes everything
	var active = _.get(options, 'active', true); 
	// var real = _.get(options, 'real', null);

	return this.find({...query, date: {$lte: date},
			'predictions.endDate': {$gte: date}}, {predictions: 1})
	.then(contestEntries => {
		if (contestEntries) {
			var allPredictions = Array.prototype.concat(...contestEntries.map(item => item.predictions ? item.predictions.toObject() : []));
			
			var isToday = DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(date)) == 0;

			if (allPredictions.length > 0 ) {
				return allPredictions.filter(item => item).filter(item => {

					//Convert startdate(exact time) to EOD datetime for comparison purposes
					var startDate = DateHelper.getMarketCloseDateTime(DateHelper.getDate(item.startDate));
					var manualExit = item.status.manualExit;
					var successFailureStatus = item.status.profitTarget || item.status.stopLoss || manualExit;
					
					var _triggered = _.get(item, 'triggered.status', true);
					var triggeredDate = _.get(item, 'triggered.date', null);

					var triggered = _triggered && (!triggeredDate || !moment(triggeredDate).isAfter(date))

					var dateCondition = !moment(startDate).isAfter(moment(date)) &&  //start is same or before
						!moment(item.endDate).isBefore(moment(date)); //end is same or after

					var isActivePrediction = triggered && dateCondition &&
						(!successFailureStatus || (successFailureStatus && !moment(item.status.date).isBefore(moment(date))));

					var isInactivePrediction = !triggered && dateCondition && 
						(!manualExit || (manualExit && !moment(item.status.date).isBefore(moment(date))));

					return active == null ? isActivePrediction || isInactivePrediction :
						!active ? isInactivePrediction : isActivePrediction;

					// var isRealPrediction = _.get(item, 'real', false);

					// return !real ? activeFilterSubset : 
					// 			real ? activeFilterSubset && isRealPrediction : 
					// 			activeFilterSubset && !isRealPrediction;
					

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

DailyContestEntry.statics.updateReadStatus = function(query, predictionId, readStatus) {
	var updates = {$set: {'predictions.$.readStatus': readStatus}};
	return this.updateOne({...query, predictions:{$elemMatch: {_id: predictionId}}}, updates);
};

DailyContestEntry.statics.updateSkipStatus = function(query, predictionId, skipStatus) {
	var updates = {$set: {'predictions.$.skippedByAdmin': skipStatus}};
	return this.updateOne({...query, predictions:{$elemMatch: {_id: predictionId}}}, updates);
}

DailyContestEntry.statics.addTradeActivityForPrediction = function(query, predictionId, tradeActivity) {
	var updates = {$addToSet: {'predictions.$.tradeActivity': tradeActivity}};
	return this.updateOne({...query, predictions:{$elemMatch: {_id: predictionId}}}, updates);
};

DailyContestEntry.statics.addOrderActivityForPrediction = function(query, predictionId, orderActivity) {
	var updates = {$addToSet: {'predictions.$.orderActivity': orderActivity}};
	return this.updateOne({...query, predictions:{$elemMatch: {_id: predictionId}}}, updates);
};

DailyContestEntry.statics.addAdminActivityForPrediction = function(query, predictionId, adminActivity) {
	console.log('Admin Activity will be added');
	var updates = {$addToSet: {'predictions.$.adminActivity': adminActivity}};
	return this.updateOne({...query, predictions:{$elemMatch: {_id: predictionId}}}, updates);
}

const DailyContestEntryModel = mongoose.model('DailyContestEntry', DailyContestEntry);
module.exports = DailyContestEntryModel;
