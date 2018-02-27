/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-27 09:43:15
*/

'use strict';
const Position = require('./Position');
const Transaction = require('./Transaction');
const Security = require('./Security');
const Performance = require('./Performance');

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

	history: [PortfolioDetail]
});

Portfolio.statics.savePortfolio = function(portfolio) {
	
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

	if(!portfolio.detail.subPositions && portfolio.detail.positions) {
		portfolio.detail.subPositions = portfolio.detail.positions;
	}
 
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
		q = q.populate('detail.subPositions.advice', 'name', {_id:{$ne:null}});
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


Portfolio.statics.updatePortfolio = function(query, updates, options, addNew) {
	var q = this.findOne(query);
	
	if (addNew) {
		q = q.select('detail history');
	}

	return q.execAsync()
	.then(portfolio => {
		
		var fupdate = {$set: Object.assign({updatedDate: new Date()}, updates)};

		if (addNew) {
			var history = updates.history ? updates.history : [];
			var modifiedUpdates = Object.assign({}, updates);

			delete modifiedUpdates.history;

			//assuming history is array;
			fupdate = {$set: modifiedUpdates, $push:{history: {$each: history}} };
		}

		return this.findOneAndUpdate(query, fupdate, options);
	});
}

Portfolio.statics.updatePortfolioWithTransactions = function(query, updates) {
	return this.findOne(query)
	.then(portfolio => {
		
		//Should end day be changed in the history ???
		const history = {date: new Date(), startDate: portfolio.startDate, endDate: portfolio.endDate};
		
		if ("positions" in updates) {
			history["positions"] = portfolio.positions;
		}

		if ("subPositions" in updates) {
			history["subPositions"] = portfolio.subPositions;	
		}

		Object.keys(updates).forEach(key => {
			if (key == "transactions") {
				updates[key].forEach(transaction => {
					portfolio[key].push(transaction);
				});
			} else if (key == "advices"){
				portfolio[key].push(updates[key]);
			} else {
				portfolio[key] = updates[key];
			}
		});

		if (Object.keys(history).length > 1) {
			
			if("history" in portfolio) {
				portfolio["history"].push(history);
			} else {
				portfolio["history"] = [history];
			}
		}

		return portfolio.saveAsync();
	})
	.catch(err => {
		console.log(err);
		return null;
	})
};

const PortfolioModel = mongoose.model('Portfolio', Portfolio);
module.exports = PortfolioModel;