/*
* @Author: Shiv Chawla
* @Date:   2017-06-29 16:28:41
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-12-17 23:41:11
*/

'use strict';
const config = require('config');
const WebSocket = require('ws'); 
const InvestorModel = require('../Marketplace/Investor');
const AdviceModel = require('../Marketplace/Advice');
const Promise = require('bluebird');

function computePerformance(portfolioHistory, benchmark) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action:"compute_performance_portfolio_history", 
	        				portfolioHistory: portfolioHistory,
	        				benchmark: benchmark});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	wsClient.close();

	    	console.log(data);
	    	if(data['error'] == '' && data['performance']) {
	    		resolve(data['performance']);
			} else {
				resolve(null);
			}
		});
	});
}

/*exports.calculatePerformanceAndUpdateInvestor = function(investor, portfolio) {
	
	var portfolioHistory = [{startDate: portfolio.startDate, 
								endDate: new Date(), 
								portfolio: {
									positions: advice.portfolio.positions,
									cash: advice.portfolio.cash}
								}];

	portfolio.history.forEach(port => {
		portfolioHistory.push({startDate: port.startDate, 
								endDate: port.endDate,
								portfolio: {
									positions: port.positions,
									cash: port.cash}
								});
	});

	return computePerformance(portfolioHistory)
	.then(performance => {
		return InvestorModel.updateInvestor({_id: investor._id}, {portfolioId: portfolioId, performance: performance});
	})

};*/


/*exports.calculatePerformanceAndUpdateAdvice = function(advice) {
	
	var portfolioHistory = [{startDate: advice.portfolio.startDate, 
								endDate: new Date(), 
								portfolio: {
									positions: advice.portfolio.positions,
									cash: advice.portfolio.cash}
								}];

	advice.portfolio.history.forEach(port => {
		portfolioHistory.push({startDate: port.startDate, 
								endDate: port.endDate,
								portfolio: {
									positions: port.positions,
									cash: port.cash}
								});
	});

	return computePerformance(portfolioHistory, advice.benchmark)
	.then(performance => {
		console.log("Hola");
		console.log(performance);
		if(performance) {
			performance["lastUpdated"] = new Date();
			return AdviceModel.updateAdvice({_id: advice._id}, {advicePerformance:performance});
		}
	})

};*/
