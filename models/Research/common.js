/*
* @Author: Shiv Chawla
* @Date:   2017-09-04 15:52:51
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-09-05 11:15:14
*/
const Promise = require('bluebird');
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Logs = new Schema({
    values: Schema.Types.Mixed,
});

const Performance = new Schema({
    detail: Schema.Types.Mixed,
});

const PortfolioHistory = new Schema({
    values: [{date: Date, portfolio: Schema.Types.Mixed}],
});

const TransactionHistory = new Schema({
    values: [{date: Date, transactions: [Schema.Types.Mixed]}],
});

Logs.statics.saveLogs = function(logs) {
	console.log(logs);
	const l = new this({values:logs});
	console.log(l);
    return logs ? l.saveAsync() : null;
};

Performance.statics.savePerformance = function(perf) {
    return perf ? (new this({detail:perf})).saveAsync() : null;
};

PortfolioHistory.statics.savePortfolioHistory = function(history) {
    if (!history) {
    	return null;
    }

    var keys = Object.keys(history);
    var nHistory = new Array(keys.length);
    var i = 0; 
    keys.sort().forEach(date => {
    	nHistory[i++] = {date: date, portfolio: history[date]};
    });

    var pArray = [];
    //save only 100 days in one document
 	var i,j,tempArray,chunk = 100;
	
	for (i=0,j=nHistory.length; i<j; i+=chunk) {
	    tempArray = nHistory.slice(i,i+chunk);
	    // do whatever
	    pArray.push(new Promise((resolve, reject) => { history ? resolve((new this({values:tempArray})).saveAsync()) : reject(null);}))
	}

    return Promise.all(pArray);
};

TransactionHistory.statics.saveTransactionHistory = function(history) {
	if (!history) {
    	return null;
	}
    
    var keys = Object.keys(history);
    var nHistory = new Array(keys.length);
    var i = 0; 
    keys.sort().forEach(date => {
    	nHistory[i++] = {date: date, transactions: history[date]};
    });

    var pArray = [];
    //save only 100 days in one document
 	var i,j,tempArray,chunk = 100;
	
	for (i=0,j=nHistory.length; i<j; i+=chunk) {
	    tempArray = nHistory.slice(i,i+chunk);
	    // do whatever
	    pArray.push(new Promise((resolve, reject) => { history ? resolve((new this({values:tempArray})).saveAsync()) : reject(null);}))
	}

    return Promise.all(pArray);
};

const LogModel = mongoose.model('Logs', Logs);
const PerformanceModel = mongoose.model('Performance', Performance);
const PortfolioHistoryModel = mongoose.model('PortfolioHistory', PortfolioHistory);
const TransactionHistoryModel = mongoose.model('TransactionHistory', TransactionHistory);

module.exports = {
	LogModel : LogModel,
	PerformanceModel : PerformanceModel,
	PortfolioHistoryModel : PortfolioHistoryModel,
	TransactionHistoryModel : TransactionHistoryModel
};