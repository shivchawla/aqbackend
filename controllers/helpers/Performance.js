/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:15:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-29 20:02:10
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
const PortfolioHelper= require('./Portfolio');

function _checkPerformanceUpdateRequired(performanceDetail) {
	if(!performanceDetail) {
		return true;
	}

	if(performanceDetail && performanceDetail.updateDate) {
        
        if(HelperFunctions.getDate(performanceDetail.updateDate) < HelperFunctions.getDate(new Date())) {
        	 return true;
        }
    } else {
    	return true; 
    } 

    if(!performanceDetail.metrics) {
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
			APIError.throwJsonError({message: "Error computing constituent performance. Portfolio not found"});
			//return null;
		}
	});
}

function _computePortfolioMetrics_portfolio(portfolio, startDate, endDate, benchmark) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action: "compute_portfolio_metrics", 
	        				portfolio: portfolio,
	        				startDate: startDate,
	        				endDate: endDate,
	        				benchmark: benchmark});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	
	    	if(data['error'] == '' && data['portfolioMetrics']) {
	    		resolve(data['portfolioMetrics']);
			} else if (data['error'] != '') {
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error computing constituents performance", errorCode: 2101}));
			}
		});
	});
}

function _computePortfolioMetrics(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		if(portfolio && portfolio.detail) {
			var currentPortfolio = portfolio.detail;

			var startDate = new Date(currentPortfolio.startDate);
			var endDate = new Date();

			return _computePortfolioMetrics_portfolio(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
		} else {
			//return null;
			APIError.throwJsonError({message: "Error computing portfolio composition. Portfolio not found", portfolio: portfolioId});
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

function _computeTruePerformance(portfolioId) {
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
			APIError.throwJsonError({message: "Error computing latest performance. Current portfolio and/or history missing"})
			//return null;
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
			APIError.throwJsonError({message: "Error computing simulated performance. Portfolio not found"});
			//return null;
		}
	});
}

function _computeLatestPerformance(portfolioId) {
	return Promise.all([
		_computeTruePerformance(portfolioId), //WORKS
		_computePortfolioMetrics(portfolioId), //WORKS
		_computeConstituentPerformance(portfolioId)
	]) 
	.then(([latestPerformance, portfolioMetrics, constituentPerformance]) => {
	
		if (latestPerformance && portfolioMetrics && constituentPerformance) {
			var latestPerformanceDate = new Date(latestPerformance.date);
	      	var portfolioMetricsDate = new Date(portfolioMetrics.date);
	      	var constituentPerformanceDate = new Date(constituentPerformance.date);

	      	var earliestDate = new Date(Math.min(latestPerformanceDate.getTime(), portfolioMetricsDate.getTime(), constituentPerformanceDate.getTime()));
			var updateMessage = "Updated successfully";

	  		var updates = {
	  			updateMessage: updateMessage, 
				updateDate: new Date(),
				metrics: {
					//earliest Date is IST date
					date:  HelperFunctions.getDate(earliestDate),
					portfolioMetrics: portfolioMetrics.value,
					portfolioPerformance: latestPerformance.value,
					constituentPerformance: constituentPerformance.value
				},

				portfolioValues: latestPerformance.portfolioValues
			};

			return updates;
		} else {
			APIError.throwJsonError({message:"Error while computing latest Performance"});
		}
	});
}

function _computeSimulatedPerformance(portfolioId) {
	return Promise.all([
		_computeSimulatedPerformanceCurrentPortfolio(portfolioId),
		_computePortfolioMetrics(portfolioId) //This is same as Current
	])
	.then(([simulatedPerformance, simulatedPortfolioMetrics]) => {
		if (simulatedPerformance && simulatedPortfolioMetrics) {
			
			var updates = {updateMessage: "Updated Successfully",
				updateDate: new Date(),
				metrics: {
					date:  HelperFunctions.getDate(new Date(simulatedPerformance.date)),
					portfolioMetrics: simulatedPortfolioMetrics.value,
					portfolioPerformance: simulatedPerformance.value,
					constituentPerformance: null,
				},

				portfolioValues: simulatedPerformance.portfolioValues
			};

			return updates;
		} else {
			APIError.throwJsonError({message: "Error computing simulated performance"});
			//return null;
		}
	});
}

function _extractPerformanceSummary(currentPerformance) {
	let performanceSummary;
	if (currentPerformance) {

		const summary = Object.assign({}, currentPerformance);

		var netValueArray = summary && summary.portfolioValues && summary.portfolioValues.length > 0 ? summary.portfolioValues.slice(-2) : null;

		var dailyChange = 0.0;
		if(netValueArray && netValueArray.length > 1){
			var prices = netValueArray.map(item => item.netValue);
			dailyChange = prices[0] > 0.0 ? (prices[1] - prices[0])/prices[0] : 0.0;
		}

		dailyChange = parseFloat(dailyChange.toPrecision(4));

		var latestPortfolioValue = netValueArray && netValueArray.length > 0 ? netValueArray[netValueArray.length - 1] : null
		var currentMetrics = summary && summary.metrics && summary.metrics.portfolioPerformance ? summary.metrics.portfolioPerformance : null; 

		performanceSummary = {
			date: summary.updateDate,
			totalReturn: currentMetrics && currentMetrics.returns ? currentMetrics.returns.totalreturn : 0.0,
			annualReturn: currentMetrics && currentMetrics.returns ? currentMetrics.returns.annualreturn : 0.0,
			volatility: currentMetrics && currentMetrics.deviation ? currentMetrics.deviation.annualstandarddeviation : 0.0,
			sharpe: currentMetrics && currentMetrics.ratios ? currentMetrics.ratios.sharperatio : 0.0,
			beta: currentMetrics && currentMetrics.ratios ? currentMetrics.ratios.beta : 0.0, 
			calmar: currentMetrics && currentMetrics.ratios ? currentMetrics.ratios.calmarratio : 0.0, 
			information: currentMetrics && currentMetrics.ratios ? currentMetrics.ratios.informationratio : 0.0, 
			alpha: currentMetrics && currentMetrics.ratios ? currentMetrics.ratios.alpha : 0.0, 
			maxLoss: currentMetrics && currentMetrics.drawdown ? currentMetrics.drawdown.maxdrawdown : 0.0,	
			currentLoss: currentMetrics && currentMetrics.drawdown ? currentMetrics.drawdown.currentdrawdown : 0.0,	
			dailyChange: dailyChange,
			netValue: latestPortfolioValue ? latestPortfolioValue.netValue : null,
			netValueDate: latestPortfolioValue ? latestPortfolioValue.date : null,
			concentration: summary && summary.metrics && summary.metrics.portfolioMetrics ? summary.metrics.portfolioMetrics.concentration : 1.0,
			weights: summary && summary.metrics && summary.metrics.portfolioMetrics ? summary.metrics.portfolioMetrics.composition.map(item => item.weight) : [],
		} 
	} else {
		performanceSummary = null;
	}

	return performanceSummary ? performanceSummary : {};		
}

module.exports.computePerformanceHypthetical = function(portfolio) {
	return new Promise((resolve,reject) => {
		if(portfolio) {
			resolve(PortfolioHelper.validatePortfolio(portfolio));
		} else {
			resolve(false);
		}
	})
	.then(validPortfolio => {	
		if (validPortfolio) { 
			return Promise.all([
				_computePortfolioMetrics_portfolio(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeConstituentPerformance_portfolio(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				_computeHistoricalPerformance(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate)
			])
		} else if(!validPortfolio) {
			//this should not be called but in any-case
			APIError.throwJsonError({message: "Invalid Portfolio composition", errorCode: 1405});
		} 
	})
	.then(([portfolioMetrics, constituentPerformance, portfolioPerformance]) => {
		return {stockPerformance: constituentPerformance, portfolioPerformance: portfolioPerformance, portfolioMetrics: portfolioMetrics};
	});
};

module.exports.computePerformanceSummary = function(portfolioId, flag) {
	var summaryType = !flag ? "current" : "simulated";

	return new Promise(resolve => {
		exports.computePerformance(portfolioId, summaryType, flag)
		.then(performance => {
			const pf = Object.assign({}, performance.toObject());
			return pf && pf[summaryType] ? _extractPerformanceSummary(pf[summaryType]) : null;
		})
		.then(performanceSummary => {
			if (performanceSummary) {
				var nestedField = "summary."+summaryType;
				return PerformanceModel.updatePerformance({portfolio: portfolioId}, {$set: {[nestedField]: performanceSummary}}, {fields: [nestedField]}).then(pf => {return pf.summary ? pf.summary[summaryType] : null;});
			} else {
				return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: [nestedField]}).then(pf => {return pf.summary ? pf.summary[summaryType] : null;});
			}
		})
		.then(pf => {
			resolve(pf);
		})
		.catch(err => {
			//ERROR in performance calculation
			//Logging the error (needs IMPROVEMENT)
			//Instead of hard fail, computation continues with error message
			PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'summary.'[summaryType]}).then(pf => {return pf.summary ? pf.summary[summaryType] : null;})
			.then(pf => {
				resolve(pf);
			});
		});
	});
};

module.exports.getPerformanceSummary = function(portfolioId, flag) {
	var summaryType = !flag ? "current" : "simulated";

	if (portfolioId) {
		return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'summary'.concat(' summaryType')})
		.then(performance => {
			var updateRequired = _checkPerformanceUpdateRequired(performance ? performance[summaryType] : null);
			return updateRequired ? exports.computePerformanceSummary(portfolioId, flag) : performance.summary[summaryType];
		})
	} else {
		APIError.throwJsonError({message: "Invalid Portfolio", portfolioId: portfolioId});
	}	
};

module.exports.computePerformance = function(portfolioId, fields, flag) {
	var performanceType = !flag ? "current" : "simulated";
	return new Promise(resolve => {
		Promise.resolve()
		.then(v => {
		 	if(performanceType == "current") {
			 	return _computeLatestPerformance(portfolioId); 
		 	} else {
			 	return _computeSimulatedPerformance(portfolioId);
		 	}
		})
		.then(performance => {
			if (performance) {
				const updates = {$set: {[performanceType]: performance}};
				return PerformanceModel.updatePerformance({portfolio: portfolioId}, updates, {fields: fields});
			} else {
				return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: fields});
				//APIError.throwJsonError({message: "Error computing latest performance", portfolio:portfolioId});
			}
		})
		.then(pf => {
			resolve(pf);
		})
		.catch(err => {
			console.log(err);
			PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: fields})
			.then(pf => {
				resolve(pf);
			});
		});
	});
};

module.exports.getPerformance = function(portfolioId, fields, flag) {
	var performanceType = !flag ? "current" : "simulated";
	if (portfolioId) {
		fields = fields ? fields : "";
		return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: fields.concat(' ').concat(performanceType)})
		.then(performance => {
			var updateRequired = _checkPerformanceUpdateRequired(performance ? performance[performanceType] : null);
			return updateRequired ? exports.computePerformance(portfolioId, fields, flag) : performance;
		})
	} else {
		APIError.throwJsonError({message: "Invalid Portfolio", portfolioId: portfolioId});
	}
};

module.exports.computeAllPerformanceSummary = function(portfolioId) {
	return exports.computePerformanceSummary(portfolioId)
	.then(latestPerformanceSummary => {
		return Promise.all([
			latestPerformanceSummary,
			//compute simulated performance summary
			exports.computePerformanceSummary(portfolioId, true)
		]);
	})
	.then(([latestPerformanceSummary, simulatedPerformanceSummary]) => {
		return {current: latestPerformanceSummary, simulated: simulatedPerformanceSummary};
	});
};

module.exports.computeAllPerformance = function(portfolioId) {
	return new Promise(resolve => {
		Promise.all([
			_computeSimulatedPerformance(portfolioId),
		 	_computeLatestPerformance(portfolioId)
	 	])
		.then(([simulatedPerformance, currentPerformance]) => {
			return Promise.all([
				simulatedPerformance,
				currentPerformance,
				_extractPerformanceSummary(currentPerformance),
				_extractPerformanceSummary(simulatedPerformance)
			])
		})
		.then(([simulatedPerformance, currentPerformance, latestPerformanceSummary, simulatedPerformanceSummary]) => {
			if (simulatedPerformance || currentPerformance || latestPerformanceSummary || simulatedPerformanceSummary) {
				const updates = {};
				if (simulatedPerformance) {
					updates["simulated"] = simulatedPerformance;
				}

				if(currentPerformance) {
					updates["current"] = currentPerformance;
				}

				if(latestPerformanceSummary || simulatedPerformanceSummary) {
					updates["summary"] = {};
				}

				if(latestPerformanceSummary) {
					updates["summary"]["current"] = latestPerformanceSummary;
				}

				if(simulatedPerformanceSummary) {
					updates["summary"]["simulated"] = simulatedPerformanceSummary;
				}

				return PerformanceModel.updatePerformance({portfolio: portfolioId}, {$set: updates}, {fields: 'current simulated summary'});
			} else {
				return PerformanceModel.fetchPerformance({portfolio: portfolioId});
				//APIError.throwJsonError({message: "Error computing either the simulated or latest performance", portfolio: portfolioId});	
			}
		})
		.then(pf => {
			resolve(pf);
		})
		.catch(err => {
			PerformanceModel.fetchPerformance({portfolio: portfolioId}).
			then(pf => {
				resolve(pf);
			})
		})
	});
};

module.exports.getAllPerformance = function(portfolioId) {
	if (portfolioId) {
		return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'current simulated summary'})
		.then(performance => {
			var updateRequired = _checkPerformanceUpdateRequired(performance ? performance.current : null);
			return updateRequired ? exports.computeAllPerformance(portfolioId) : performance;
		})
	} else {
		APIError.throwJsonError({message: "Invalid Portfolio", portfolioId: portfolioId});
	}
};

module.exports.computePerformanceRating = function(performance) {
	//return PerformanceModel.fetchPerformance({portfolio: portfolioId})
	//.then(performance => {
		//WRITE RATING LOGIC HERE
		if (performance) {
			//Use Sharpe Ratio Fractional Rnking
			//Use Information Ratio Fractional Ranking
			//Use Calmar Ratio Fractional Ranking
			//Use Total Return Fractional Ranking
			//Use Inverse of Volatility Fractional Ranking
			//Use Tracking Error Fractional Ranking

			return 5.0;
		} else {
			return 5.0
			//APIError.throwJsonError({portfolioId: portfolioId, message: "Performance not available"});
		}
	//});
};
