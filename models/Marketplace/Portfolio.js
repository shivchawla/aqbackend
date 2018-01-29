/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-29 22:25:58
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

	seedCash: Number,

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
	//NOT NECESSARY (transaction contains advice reference)
	/*advices: [{
		type: Schema.Types.ObjectId,
    	ref: 'Advice'
	}],*/

	transactions: [Transaction],

	history: [PortfolioDetail],

	/*cashHistory:[{
		cash: Number,
		date: Date
	}]*/
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
 
	portfolio.seedCash = portfolio.detail ? portfolio.detail.cash : 0.0;

	portfolio.createdDate = new Date();

	const port = new this(portfolio);
	return port.saveAsync(); 
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
		return port.saveAsync();	
	});
};

Portfolio.statics.addTransactions = function(query, transactions) {
	return this.findOne(query)
	.then(portfolio => {
		transactions.forEach(transaction => {
			if (transaction.advice == "") {
                transaction.advice = null;
            } else {
                transaction.advice = new mongoose.Types.ObjectId(transaction.advice);
            }
			portfolio.transactions.push(transaction);	
		});

		console.log('Saving');
		return portfolio.saveAsync();
	});
};


Portfolio.statics.updatePortfolio = function(query, updates, addNew) {
	return this.findOne(query).select('detail history')
	.then(portfolio => {
		
		var fupdate = {$set: updates};

		if (addNew) {
			var history = updates.history ? updates.history : [];
			var modifiedUpdates = JSON.parse(JSON.stringify(updates));

			delete modifiedUpdates.history;

			//assuming history is array;
			fupdate = {$set: modifiedUpdates, $push:{history: {$each: history}} };
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

		return portfolio.saveAsync();
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