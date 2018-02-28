/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:15:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-28 13:15:30
*/

'use strict';
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const APIError = require('../../utils/error');
const config = require('config');
const WebSocket = require('ws'); 
const Promise = require('bluebird');
const HelperFunctions = require('./index');

function _checkPerformanceUpdateRequired(performanceDetail) {
	if(!performanceDetail) {
		return true;
	}

	if(performanceDetail && performanceDetail.updatedDate) {
        if(HelperFunctions.getDate(performanceDetail.updatedDate) < HelperFunctions.getDate(new Date())) {
        	 return true;
        }
    } else {
    	return true; 
    } 

	var performanceDetailMetrics = performanceDetail.metrics ? performanceDetail.metrics : [];
    if(performanceDetailMetrics.length == 0) {
    	return true;
    }
        
    return false;
}

function _computePortfolioValue(portfolio, startDate, endDate) {
	
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action:"compute_portfolio_value_period", 
	        				portfolio: portfolio, startDate:startDate, endDate:endDate});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);

	    	if(data['error'] == '' && data['netValue']) {
	    		resolve(data['netValue']);
			} else if (data["error"] != "") {
				reject(new Error(data["error"]));
			} else {
				reject(new Error("Error computing netvalue of portfolio"))
			}
		});
    });
}

function _computePerformance_portfolioValues(portfolioValues, benchmark) {

	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);

	        var msg = JSON.stringify({action:"compute_performance_netvalue", 
        								netValue: portfolioValues.map(x=>x.netValue),
        								dates: portfolioValues.map(x=>x.date),
        								benchmark: benchmark ? benchmark : {ticker: 'NIFTY_50'}}); 

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);

	    	if(data['error'] == '' && data['performance']) {
	    		resolve(data['performance']);
			} else if (data["error"] != "") {
				reject(new Error(data["error"]));
			} else {
				reject(new Error("Error computing netvalue of portfolio performance"))
			}
		});

	});
}

function _computeHistoricalPerformance(portfolio, startDate, endDate) {
	
	return _computePortfolioValue(portfolio, startDate, endDate)
	.then(portfolioValue => {
		return Promise.all([portfolioValue, _computePerformance_portfolioValues(portfolioValue, portfolio.benchmark)]);
	})
	.then(([portfolioValues, performance]) => {
		portfolioValues = portfolioValues.map(item => { 
		  	//Changing time to unix timestamp
		  	item.date = new Date(item.date).getTime()/1000; 
		  	return item;
		});	
	
		return {portfolioValues: portfolioValues, analytics: performance};
	});
};

function _computeConstituentPerformance_portfolio(portfolio, startDate, endDate, benchmark) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action: "compute_portfolio_constituents_performance", 
	        				portfolio: portfolio,
	        				startDate: startDate,
	        				endDate: endDate,
	        				benchmark: benchmark});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	
	    	if(data['error'] == '' && data['constituentPerformance']) {
	    		resolve(data['constituentPerformance']);
			} else if (data['error'] != '') {
				reject(new Error(data["error"]));
			} else {
				reject(new Error("Internal error computing constituents performance"))
			}
		});
	});
}

function _computeConstituentPerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var startDate = HelperFunctions.getDate(currentPortfolio.startDate);
		var endDate = new Date();

		return _computeConstituentPerformance_portfolio(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computePortfolioComposition_portfolio(portfolio, startDate, endDate, benchmark) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action: "compute_portfolio_composition", 
	        				portfolio: portfolio,
	        				startDate: startDate,
	        				endDate: endDate,
	        				benchmark: benchmark});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	
	    	if(data['error'] == '' && data['portfolioComposition']) {
	    		resolve(data['portfolioComposition']);
			} else if (data['error'] != '') {
				reject(new Error(data["error"]));
			} else {
				reject(new Error("Internal error computing constituents performance"))
			}
		});
	});
}

function _computePortfolioComposition(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio) {
			var currentPortfolio = portfolio.detail;

			var startDate = new Date(currentPortfolio.startDate);
			var endDate = new Date();

			return _computePortfolioComposition_portfolio(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
		} else {
			APIError.throwJsonError({message: "Portfolio not found", portfolioId: portfolioId});
		}
	});
}

function _computePerformance_portfolioHistory(portfolioHistory, benchmark) {
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
	    	
	    	if(data['error'] == '' && data['performance']) {
	    		var performance = data['performance'];
	    		performance.portfolioValues = performance.portfolioValues.map(item => { 
				  	//Changing time to unix timestamp
				  	item.date = new Date(item.date).getTime()/1000; 
				  	return item;
				});	
			
	    		resolve(performance);

			} else if (data['error'] != '') {
				reject(new Error(data["error"]));
			} else {
				reject(new Error("Internal error computing performance"))
			}
		});
	});
}

function _computePerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark history'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		
		var portfolioHistory = [{startDate: currentPortfolio.startDate, 
									endDate: new Date(),//currentPortfolio.endDate,
									portfolio: {
										positions: currentPortfolio.positions,
										cash: currentPortfolio.cash}
									}];

		if(portfolio.history) {							
			portfolio.history.forEach(port => {
				portfolioHistory.push({startDate: port.startDate ? port.startDate : port.endDate, 
										endDate: port.endDate,
										portfolio: {
											positions: port.positions,
											cash: port.cash
										}
									});
			});
		}

		return _computePerformance_portfolioHistory(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computeSimulatedPerformanceCurrentPortfolio(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var startDate = new Date(); //new Date(currentPortfolio.startDate);
		startDate = new Date(startDate.setDate(startDate.getDate() - 365));

		var portfolioHistory = [{startDate: startDate, 
									endDate: new Date(), 
									portfolio: {
										positions: currentPortfolio.positions,
										cash: currentPortfolio.cash}
									}];

		return _computePerformance_portfolioHistory(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computeLatestPerformance(portfolioId) {
	if (portfolioId) {
		return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'current'})
		.then(performance => {
			var updateRequired = _checkPerformanceUpdateRequired(performance ? performance.current : null);
			return updateRequired ? Promise.all([
					true, 
					_computePerformance(portfolioId), //WORKS
					_computePortfolioComposition(portfolioId), //WORKS
					_computeConstituentPerformance(portfolioId)
					]) : [false, null, null, null];
		})
		.then(([updated, latestPerformance, portfolioComposition, constituentPerformance]) => {
			
			if (updated){
				var latestPerformanceDate = new Date(latestPerformance.date);
		      	var portfolioCompositionDate = new Date(portfolioComposition.date);
		      	var constituentPerformanceDate = new Date(constituentPerformance.date);

		      	var earliestDate = new Date(Math.min(latestPerformanceDate.getTime(), portfolioCompositionDate.getTime(), constituentPerformanceDate.getTime()));
				var updateMessage = updated ? "Updated successfully" : "Performance up-to-date";

		  		var updates = {
		  			updateMessage: updateMessage, 
					updateDate: new Date(),
					metrics: {
						date:  HelperFunctions.getDate(earliestDate),
						portfolioComposition: portfolioComposition.value,
						portfolioPerformance: latestPerformance.value,
						constituentPerformance: constituentPerformance.value
					},

					portfolioValues: latestPerformance.portfolioValues
				};

				return updates;
			} else {
				return null;
			}
		});
	} else {
		APIError.throwJsonError({message: "Invalid Portfolio", portfolioId: portfolioId});
	}
}

function _computeSimulatedPerformance(portfolioId) {
	return _computeSimulatedPerformanceCurrentPortfolio(portfolioId)
	.then(simulatedPerformance => {
		
		if (simulatedPerformance) {
			var updates = {updateMessage: "Updated Successfully",
				updateDate: new Date(),
				metrics: {
					date:  HelperFunctions.getDate(new Date(simulatedPerformance.date)),
					portfolioComposition: null,
					portfolioPerformance: simulatedPerformance.value,
					constituentPerformance: null,
				},

				portfolioValues: simulatedPerformance.portfolioValues
			};

			return updates;
		} else {
			return null;
		}
	});
}

module.exports.computeLatestPerformance = function(portfolioId) {
	return _computeLatestPerformance(portfolioId);
};

module.exports.computeSimulatedPerformance = function(portfolioId) {
	return _computeSimulatedPerformance(portfolioId);
};

module.exports.computePerformanceHypthetical = function(portfolio) {
	return HelperFunctions.validatePortfolio(portfolio)
	.then(validPortfolio => {	
		if (validPortfolio) { 
			return Promise.all([
				_computePortfolioComposition(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeConstituentPerformance(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeHistoricalPerformance(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate)])
		} else if(!validPortfolio) {
			//this should not be called but in any-case
			APIError.throwJsonError({message: "Invalid portfolio composition"});
		} 
	})
	.then(([portfolioComposition, constituentPerformance, portfolioPerformance]) => {
		return {stockPerformance: constituentPerformance, portfolioPerformance: portfolioPerformance, portfolioComposition: portfolioComposition};
	});
};

module.exports.updatePerformanceAllAdvices = function() {
	return AdviceModel.fetchAdvices({deleted:false}, {fields: 'portfolio public'})
	.then(advices => {
		if (advices) {
			return Promise.map(advices, function(advice) {
				if(advice) {
					if(advice.portfolio) {
						return {
							portfolioId: advice.portfolio, 
							performance: {
								current: _computeLatestPerformance(advice.portfolio),
								simulated: _computeSimulatedPerformance(advice.portfolio)
							}
						};
					} else {
						return {portfolioId: null, performance: null};	
					}
				} else {
					return {portfolioId: null, performance: null};
				}
			});
		} else {
			APIError.throwJsonError({message: "No Advices found"})
		}
	})
	.then(updates => {
		return Promise.map(updates, function(update) {
			if(update.portfolioId && update.performance) {
				return PerformanceModel.updatePerformance({_id: update.portfolioId}, update.performance);
			} else {
				return null;	
			}
		});
	});
};

