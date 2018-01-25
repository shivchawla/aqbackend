/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-25 13:28:56
*/

'use strict';
const Position = require('./Position');
const Transaction = require('./Transaction');
const Security = require('./Security');
const Performance = require('./Performance');

const mongoose = require('../index');
const Schema = mongoose.Schema;

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

	//To track the advices bought
	advices: [{
		type: Schema.Types.ObjectId,
    	ref: 'Advice'
	}],

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
	}

	if(!portfolio.detail.subPositions && portfolio.detail.positions) {
		portfolio.detail.subPositions = portfolio.detail.positions;
	}

	const port = new this(portfolio);
	return port.save(); 
};

Portfolio.statics.fetchPortfolio = function(query, options) {
	var q = this.findOne(query)
	
	if(options.fields) {
		q = q.select(options.fields);	
	}
	
	//Select advice name and 
	if((options.fields && options.fields.indexOf('subPositions') !=-1 ) || !options.fields) {
		q.populate('subPositions.advice', 'name', {_id:{$ne:null}});
	}

	return q.execAsync();
};

Portfolio.statics.clonePortfolio = function(query, options) {
	return this.findOne(query, options)
	.then(portfolio => {
		const port = new this(portfolio);
		port._id = mongoose.Types.ObjectId();
        port.isNew = true; 
		return port.save();	
	});
};

Portfolio.statics.addTransactions = function(query, transactions) {
	this.findOne(query)
	.then(portfolio => {
		transactions.forEach(transaction => {
			portfolio.transactions.push(transaction);	
		});

		return portfolio.save();
	})

};

Portfolio.statics.updatePortfolio = function(query, updates, addNew) {
	return this.findOne(query)
	.then(portfolio => {
		
		console.log(updates);
		var fupdate = {$set: updates};

		if (addNew) {
			//var newStartDate = updatedPortfolio.startDate;
			var history = updates.detail;
			
			//CHANGE DATE to date - 1
			history.endDate = updates.detail.startDate;

			fupdate = {$set: modifiedUpdates, $push:{history: history}};
		}

		return this.findOneAndUpdate(query, fupdate, {upsert:true, new: true});
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

		return portfolio.save();
	})
	.catch(err => {
		console.log(err);
		return null;
	})
};

const PortfolioModel = mongoose.model('Portfolio', Portfolio);
module.exports = PortfolioModel;
//module.exports = Portfolio;



//1. Create a portfolio
//2. Send portfolio for validation (blocking request?? NO..
//	 2a. HTTP request to Node backend 
//	 2b. The request is then forwarded to Julia websocket server
//	 2c. The response comes via Julia -> Node -> UI (Websocket)
//						comes to UI via WS)
//3. In validation,
//	  3a. Test if portfolio has right securitues
//	  3b. Compute metrics and test it against AQ.
//	  3c. Basic Validation on the UI before sending to backend.	  		   