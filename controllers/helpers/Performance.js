/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:15:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-16 19:50:49
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
	    		var output = data['netValue'];
	    		resolve(Object.keys(output).sort().map(key => {return {date: new Date(key), netValue: output[key]};}));
			} else if (data["error"] != "") {
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error computing netvalue of portfolio", errorCode: 2101}));
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
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error computing netvalue of portfolio performance", errorCode: 2101}));
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
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error computing constituents performance", errorCode: 2101}));
			}
		});
	});
}

function _computeConstituentPerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio && portfolio.detail) {
			var currentPortfolio = portfolio.detail;
			//Check if start date is present (Added: 15/03/2018)
			var startDate = HelperFunctions.getDate(currentPortfolio.startDate ? currentPortfolio.startDate : new Date());
			var endDate = new Date();
			return _computeConstituentPerformance_portfolio(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
		} else {
			return null;
		}
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
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error computing constituents performance", errorCode: 2101}));
			}
		});
	});
}

function _computePortfolioComposition(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio && portfolio.detail) {
			var currentPortfolio = portfolio.detail;

			var startDate = new Date(currentPortfolio.startDate);
			var endDate = new Date();

			return _computePortfolioComposition_portfolio(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
		} else {
			return null;
			//APIError.throwJsonError({message: "Portfolio not found", portfolioId: portfolioId});
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
	    		
	    		performance.portfolioValues = Object.keys(performance.portfolioValues).sort().map(key => {
	    			return {date: new Date(key), netValue: performance.portfolioValues[key]};
				});	

	    		resolve(performance);

			} else if (data['error'] != '') {
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error computing performance", errorCode: 2101}));
			}
		});
	});
}

function _computePerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark history'})
	.then(portfolio => {
		var portfolioHistory = [];
		
		if(portfolio && portfolio.detail) {
			var currentPortfolio = portfolio.detail;
			portfolioHistory.push({startDate: currentPortfolio.startDate, 
										endDate: new Date(),//currentPortfolio.endDate,
										portfolio: {
											positions: currentPortfolio.positions,
											cash: currentPortfolio.cash}
										});
		}

		if(portfolio && portfolio.history && portfolio.history.length > 0) {							
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
		if (portfolioHistory.length > 0) {
			return _computePerformance_portfolioHistory(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
		} else {
			return null;
		}
	});
}

function _computeSimulatedPerformanceCurrentPortfolio(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio && portfolio.detail){
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
		} else {
			return null;
		}
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
			
			if (updated && latestPerformance && portfolioComposition && constituentPerformance) {
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

module.exports.computePerformanceHypthetical = function(portfolio) {
	return new Promise((resolve,reject) => {
		if(portfolio) {
			resolve(HelperFunctions.validatePortfolio(portfolio));
		} else {
			resolve(false);
		}
	})
	.then(validPortfolio => {	
		if (validPortfolio) { 
			return Promise.all([
				_computePortfolioComposition_portfolio(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeConstituentPerformance_portfolio(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeHistoricalPerformance(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate)
			])
		} else if(!validPortfolio) {
			//this should not be called but in any-case
			APIError.throwJsonError({message: "Invalid Portfolio composition", errorCode: 1405});
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
			APIError.throwJsonError({message: "No advices found", errorCode: 1118})
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

module.exports.getLatestPerformance = function(portfolioId) {
	return Promise.all([
		_computeSimulatedPerformance(portfolioId),
	 	_computeLatestPerformance(portfolioId)
 	])
	.then(([simulatedPerformance, currentPerformance]) => {

		if (simulatedPerformance || currentPerformance) {
			const updates = {};
			if (simulatedPerformance) {
				updates["simulated"] = simulatedPerformance;
			}

			if(currentPerformance) {
				updates["current"] = currentPerformance;
			}

			return PerformanceModel.updatePerformance({portfolio: portfolioId}, updates);
		} else {
			return PerformanceModel.fetchPerformance({portfolio: portfolioId});
		}
		
	})
	.catch(err => {
		return PerformanceModel.fetchPerformance({portfolio: portfolioId});
	})
}

module.exports.getPerformanceSummaryOLD = function(portfolioId) {
	return exports.getLatestPerformance(portfolioId)
	.then(performance => {
		if (performance && performance.current) {

			const summary = Object.assign({}, performance.current.toObject());

			delete summary.portfolioValues;
			delete summary.metrics.constituentPerformance;
			delete summary.metrics.portfolioComposition;

			summary.metrics = summary.metrics.portfolioPerformance;
			return summary; 
		} else {
			return null;
		}
	})
	.catch(err => {
		//ERROR in performance calculation
		//Logging the error (needs IMPROVEMENT)
		//Instead of hard fail, computation continues with error message
		return {error: err.message};
	});
}

module.exports.getPerformanceSummary = function(portfolioId) {
	return exports.getLatestPerformance(portfolioId)
	.then(performance => {
		if (performance && performance.current) {

			const summary = Object.assign({}, performance.current.toObject());

			var netValueArray = summary && summary.portfolioValues && summary.portfolioValues.length > 0 ? summary.portfolioValues.slice(-2) : null;

			var dailyChange = 0.0;
			if(netValueArray && netValueArray.length > 1){
				var prices = netValueArray.map(item => item.netValue);
				dailyChange = prices[0] > 0.0 ? (prices[1] - prices[0])/prices[0] : 0.0;
			}

			dailyChange = parseFloat(dailyChange.toPrecision(4));

			var latestPortfolioValue = netValueArray && netValueArray.length > 0 ? netValueArray[netValueArray.length - 1] : null
			var currentMetrics = summary && summary.metrics && summary.metrics.portfolioPerformance ? summary.metrics.portfolioPerformance : null; 
			
			return {
				date: summary.updateDate,
				return: currentMetrics && currentMetrics.returns ? currentMetrics.returns.totalreturn : 0.0,
				volatility: currentMetrics && currentMetrics.deviation ? currentMetrics.deviation.annualstandarddeviation : 0.0,
				sharpe: currentMetrics && currentMetrics.ratios ? currentMetrics.ratios.sharperatio : 0.0,
				beta: currentMetrics && currentMetrics.ratios ? currentMetrics.ratios.beta : 0.0, 
				maxLoss: currentMetrics && currentMetrics.drawdown ? currentMetrics.drawdown.maxdrawdown : 0.0,	
				currentLoss: currentMetrics && currentMetrics.drawdown ? currentMetrics.drawdown.currentdrawdown : 0.0,	
				dailyChange: dailyChange,
				netValue: latestPortfolioValue ? latestPortfolioValue.netValue : null,
				netValueDate: latestPortfolioValue ? latestPortfolioValue.date : null,
			} 
		} else {
			return null;
		}
	})
	.catch(err => {
		//ERROR in performance calculation
		//Logging the error (needs IMPROVEMENT)
		//Instead of hard fail, computation continues with error message
		return {error: err.message};
	});
}

