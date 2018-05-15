/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-05-15 11:01:27
*/

'use strict';
const Position = require('./Position');
const Transaction = require('./Transaction');
const Security = require('./Security');
const Performance = require('./Performance');
const DateHelper = require('../../utils/Date');

const mongoose = require('../index');
const Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;

const PortfolioDetail = new Schema({
	startDate: Date,
	endDate: Date,

	positions: [Position],
	
	//Track positions per Advice
	subPositions: [Position], 
	
	cash: {
		type: Number,
		default: 0
	}
});

const Portfolio = new Schema({
	name: String,

	benchmark: Security,

	//CURRENT PORTFOLIO
	detail: PortfolioDetail, 
	
	createdDate: Date,

	updatedDate: Date,
	
	deleted: {
		type: Boolean,
		default: false,
	},

	deletedDate: Date,

	transactions: [Transaction],

	//History contains everything...EXCEPT the latest Portfolio
	history: [PortfolioDetail]

});

Portfolio.statics.savePortfolio = function(portfolio, isAdvice) {
	
	//Convert security strings to upper case
	if(portfolio.detail) {
		var positions = portfolio.detail.positions;

		positions.forEach(pos => {
			pos.security.ticker = pos.security.ticker.toUpperCase();
			pos.security.securityType = pos.security.securityType.toUpperCase();
			pos.security.country = pos.security.country.toUpperCase();
			pos.security.exchange = pos.security.exchange.toUpperCase();  
		});
	} else {
		portfolio.detail = {cash: 0.0, positions:[], subPositions:[]};
	}

	if(!portfolio.detail.subPositions && portfolio.detail.positions && !isAdvice) {
		portfolio.detail.subPositions = portfolio.detail.positions;
	}

	//There is no end date of active portfolio
	portfolio.detail.endDate = farfuture()
	portfolio.createdDate = new Date();

	const port = new this(portfolio);
	return port.saveAsync(); 
};

Portfolio.statics.fetchPortfolio = function(query, options) {
	var q = this.findOne(query);
		
	if(options.fields) {
		q = q.select(options.fields);	
	}
	
	//Select advice name and 
	if((options.fields && options.fields.indexOf('detail') !=-1 ) || !options.fields) {
		q = q.populate('detail.subPositions.advice', '_id name', {_id:{$ne:null}});
	}

	if((options.fields && options.fields.indexOf('history') !=-1 ) || !options.fields) {
		q = q.populate('history.subPositions.advice', '_id name', {_id:{$ne:null}});
	}

	return q.execAsync();
};

Portfolio.statics.fetchPortfolios = function(query, options) {
	var q = this.find(query);
		
	if(options.fields) {
		q = q.select(options.fields);	
	}
	
	return q.execAsync();
};

Portfolio.statics.clonePortfolio = function(query, options) {
	return this.findOne(query, options)
	.then(portfolio => {
		const port = new this(portfolio);
		port._id = ObjectId();
        port.isNew = true; 
		return port.saveAsync();	
	});
};

Portfolio.statics.addTransactions = function(query, transactions) {
	return this.findOne(query)
	.then(portfolio => {

		var oldTransactions = transactions.filter(item => {return item._id != null});
		var newTransactions = transactions.filter(item => {return item._id == null});

		//PUSH new transactions
		newTransactions.forEach(transaction => {
			/*if (transaction.advice == "") {
                transaction.advice = null;
            } else {
                transaction.advice = ObjectId(transaction.advice);
            }*/

            if (transaction._id == null) {
            	delete transaction._id;
            }

			portfolio.transactions.push(transaction);	
		});


		//UPDATE old transactions
		oldTransactions.forEach(transaction => {
			var idx = portfolio.transactions.map(item => item._id.toString()).indexOf(transaction._id);
			
			if(idx == -1) {
				console.log("Old transaction not found. This is not possible");
			} else {
				portfolio.transactions[idx] = transaction;
			}
		});

		return portfolio.saveAsync();
	});
};

Portfolio.statics.updateTransactions = function(query, transactions) {
	return this.findOne(query)
	.then(portfolio => {

		//UPDATE old transactions
		transactions.forEach(transaction => {
			var idx = portfolio.transactions.map(item => item._id).indexOf(transaction._id);
			
			if(idx == -1) {
				console.log("Transaction not found while updating");
			} else {
				portfolio.transactions[idx] = transaction;
			}
		});

		return portfolio.saveAsync();
	});
};

Portfolio.statics.deleteTransactions = function(query, transactions) {
	return this.findOne(query)
	.then(portfolio => {

		//UPDATE old transactions
		transactions.forEach(transaction => {
			var idx = portfolio.transactions.map(item => item._id).indexOf(transaction._id);
			
			if(idx == -1) {
				console.log("Transaction not found while deleting");
			} else {
				portfolio.transactions[idx].deleted = true;
			}
		});

		return portfolio.saveAsync();
	});
};

Portfolio.statics.updatePortfolio = function(query, updates, options) {
	var q = this.findOne(query);
	
	return q.execAsync()
	.then(portfolio => {
		//Update the end date of current portfolio before sending to history
		//EndDate of historical entry = startDate of new portfolio - 1 day
		let newHistoryItem;
		if (updates.detail) {
			updates.detail.endDate = DateHelper.getDate(farfuture());
			
			//Current detail becomes history (if history is not provided as an update input)
			if (options.appendHistory && !updates.history) {
				portfolio = Object.assign({}, portfolio.toObject());
				//Moving current detail to history makes sense only when partial history 
				//(only append history comes in)
				var incomingStartDate = DateHelper.getDate(updates.detail.startDate);
				var currenPortfolioStartDate = DateHelper.getDate(portfolio.detail.startDate);
				
				if (DateHelper.compareDates(incomingStartDate, currenPortfolioStartDate) != 1) {
					throw Error("Error in date of incoming portfolio");
				}

				newHistoryItem = portfolio.detail;
					
				var _d = DateHelper.getDate(incomingStartDate);
				_d.setDate(_d.getDate() - 1);
				newHistoryItem.endDate = _d;
			}
		}

		var fupdate = {$set: Object.assign({updatedDate: new Date()}, updates)};

		//If append history is TRUE
		if (options.appendHistory) {
			var modifiedUpdates = Object.assign({}, updates);

			//Use history part of the updates or the NEW history item
			var history = updates.history ? updates.history  : [newHistoryItem];
			delete modifiedUpdates.history;
			
			fupdate = {
				$set: Object.assign({updatedDate: new Date()}, modifiedUpdates), 
				$push: {history : {$each: history}}
			};
		}

		return this.findOneAndUpdate(query, fupdate);
	})
	.then(update => {
		if (options && options.fields) {
			return this.fetchPortfolio(query, {fields: options.fields});
		} else {
			return null;
		}
	});
}

Portfolio.statics.deletePortfolio = function(query) {
	return this.findOneAndRemove(query);
};

function farfuture() {
	return new Date(2200, 1, 1);
}

const PortfolioModel = mongoose.model('Portfolio', Portfolio);
module.exports = PortfolioModel;