/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-09-04 13:54:32
*/

'use strict';
const Position = require('./Position');
const Transaction = require('./Transaction');
const Security = require('./Security');
const Performance = require('./Performance');

const mongoose = require('../index');
const Schema = mongoose.Schema;

const Portfolio = new Schema({

	startDate: Date,

	endDate: Date,

	createdDate: Date,

	updatedDate: Date,

	name: String,

	deleted: {
		type: Boolean,
		default: false,
	},

	deletedDate: Date,

	cash: {
		type: Number,
		default: 0
	},

	positions: [Position],

	//Track positions per Advice
	subPositions: [Position], 

	//To track the advices bought
	advices: [{
		type: Schema.Types.ObjectId,
    	ref: 'Advice'
	}],

	transactions: [Transaction],

	/*portfolioStats: [{
		date: Date,
    	netValue: Number,
    	cash: {
			type: Number,
			default: 0
		},
	}],*/

	history: [{
		startDate: Date,
		
		endDate: Date,
		
		positions: [Position],
		
		subPositions:[Position],

		cash: Number

		/*portfolioStats: {
			date: Date,
    		netValue: Number,
	    	cash: {
				type: Number,
				default: 0
			},
		},*/
	}],

});


Portfolio.statics.savePortfolio = function(portfolio) {
	
	if(!portfolio.subPositions && portfolio.positions) {
		portfolio.subPositions = portfolio.positions;
	}

	console.log(portfolio);

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
		q.populate('subPositions.advice','name', {_id:{$ne:null}});
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

Portfolio.statics.updatePortfolio = function(query, updates) {
	return this.findOne(query)
	.then(portfolio => {
		
		const history = {date: new Date()};
		if ("positions" in updates) {
			history["positions"] = portfolio.positions;
		}

		if ("subPositions" in updates) {
			history["subPositions"] = portfolio.subPositions;	
		}

		if ("portfolioStats" in updates) {
			history["portfolioStats"] = portfolio.portfolioStats;
		}

		Object.keys(updates).forEach(key => {
			if (key == "transactions"){
				updates[key].forEach(transaction => {
					portfolio[key].push(transaction);
				});
			} else if (key == "advices"){
				portfolio[key].push(updates[key]);
			} else {
				console.log(key);
				console.log(portfolio[key]);
				console.log(updates[key]); 
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