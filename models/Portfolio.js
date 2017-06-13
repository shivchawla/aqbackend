/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-06-13 10:36:39
*/

'use strict';
const Position = require('./Position');
const Transaction = require('./Transaction');
const Security = require('./Security');

const mongoose = require('./index');
const Schema = mongoose.Schema;

const Portfolio = new Schema({

	startDate: Date,
	
	updatedDate: Date,
	
	endDate: Date,

	deleted: {
		type: Boolean,
		default: false,
	},

	benchmark: Security,

	cash: {
		type: Number,
		default: 0
	},

	positions: [Position],

	transactions: [{
	  	type: Schema.Types.ObjectId,
        ref: 'Transaction'
    }],

});

Portfolio.statics.createPortfolio = function(portfolio) {

};

Portfolio.statics.addTransactions = function(query, transactions) {
	return this.findOne(query)
	.then(portfolio => {
		transactions.forEach(transaction => {
			portfolio.transactions.push(transaction);	
		});

		return portfolio.save
	})

};

Portfolio.statics.updatePortfolio = function(query, updates) {
	return this.findOne(query)
	.then(portfolio => {
		/*for key in updates {
			portfolio[key] = updates[key];
		}*/

		return portfolio.save();
	});
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