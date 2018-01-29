/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 13:06:04
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-29 21:47:09
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const UserModel = require('../../models/user');
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const APIError = require('../../utils/error');
const config = require('config');
const WebSocket = require('ws'); 
const Promise = require('bluebird');

function _compareIds(x, y) {
	if(!x && !y) {
		return true;
	} else if(!x || !y) {
		return false;
	} else {
		return x.equals(y)
	}
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

function _computePortfolioPerformance(portfolioValues, benchmark) {

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

function _updatePositions(positions, transactions) {
	
	//SEND all the transactions and current positions to Julia server 
	//Julia computes the updated portfolio	
	//HEAVY DUTY WORK IS DONE BY JULIA
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);

	        const portfolio = {
	        	positions: positions,
	        	cash: 0.0
	        };

	        var msg = JSON.stringify({action:"compute_updated_portfolio", 
        								portfolio: portfolio,
        								transactions: transactions}); 

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	if(data['portfolio']) {
    			resolve(data['portfolio']);
			} else {
				resolve(null);
			}
		});
	});
}

module.exports.comparePortfolioDetail = function(oldPortfolioDetail, newPortfolioDetail) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action:"compare_portfolio", 
	        				oldPortfolio: oldPortfolio,
	        				newPortfolio: newPortfolio});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	
	    	if(data['error'] == '' && data['compare']) {
	    		resolve(data['compare']);
			} else if (data['error'] != '') {
				reject(new Error(data["error"]));
			} else {
				reject(new Error("Internal error in comparing portfolios"))
			}
		});
	});
}

module.exports.compareSecurity = function(oldSecurity, newSecurity) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action:"compare_security", 
	        				oldSecurity: oldSecurity,
	        				newSecurity: newSecurity});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	
	    	if(data['error'] == '' && data['compare']) {
	    		resolve(data['compare']);
			} else if (data['error'] != '') {
				reject(new Error(data["error"]));
			} else {
				reject(new Error("Internal error in comparing Security"))
			}
		});
	});
}

module.exports.computeUpdatedPortfolioForStockTransactions = function(portfolio, transactions) {
	
	console.log(transactions);
	var uniqueAdvicesInTransactions = Array.from(new Set(transactions.map(item => item.advice)));

	console.log(uniqueAdvicesInTransactions);

	return Promise.all([_updatePositions(portfolio.positions, transactions),
				
			Promise.map(uniqueAdvicesInTransactions, function(adviceId) {
				var transactionsForAdviceId = transactions.filter(item => {
					return _compareIds(item.advice, adviceId);
				}); 	


				var subPositionsForAdviceId = portfolio.subPositions.filter(item => {
					return _compareIds(item.advice, adviceId);
				}); 

				return _updatePositions(subPositionsForAdviceId, transactionsForAdviceId)
					.then(subPortfolio => {
						subPortfolio.positions.map(position => {
	    						position["advice"] = adviceId
	    						return position});

						console.log(subPortfolio);
						return subPortfolio;
					});		

			})
		])
	.then(([fullPortfolio, subPortfolios]) => {
	
		var subPositions = [];
		subPortfolios.forEach(subPortfolio => {
			subPositions = subPositions.concat(subPortfolio.positions);
		})

		const updatedPortfolio = {
			positions: fullPortfolio.positions,
			subPositions: subPositions,
			cash: portfolio.cash + fullPortfolio.cash
		};

		return updatedPortfolio;
	});
}

module.exports.OLDcomputeUpdatedPortfolioForStockTransactions = function(portfolio, transactions, adviceId) {
		
	var subPositions = portfolio.subPositions.filter(item => {
			return _compareIds(item.advice, adviceId);}); 	


	return Promise.all([_updatePositions(subPositions, transactions),
						_updatePositions(portfolio.positions, transactions)])
	.then(([port2, port1]) => {

		port2.positions.forEach(position => {
	    						position["advice"] = adviceId});

		var subPositions = portfolio.subPositions.filter(item => {
								return !_compareIds(item.advice, adviceId);})
							.concat(port2.positions);

		const updatedPortfolio = {
			positions: port1.positions,
			subPositions: subPositions,
			cash: portfolio.cash + port1.cash
		};

		return updatedPortfolio;
	});
}

module.exports.computePerformance = function(portfolioHistory, benchmark) {
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
};

module.exports.computeHistoricalPerformance = function(portfolio, startDate, endDate) {
	
	return _computePortfolioValue(portfolio, startDate, endDate)
	.then(portfolioValue => {
		return Promise.all([portfolioValue, _computePortfolioPerformance(portfolioValue, portfolio.benchmark)]);
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

module.exports.validateAdvice = function(advice, oldAdvice) {

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_advice", 
            						advice: advice,
            						lastAdvice: oldAdvice ? oldAdvice : ""});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			
        	if (data["error"] == "") {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(new Error(data["error"]))
		    } else {
		    	reject(new Error("Error validating the advice"))
		    }
	    });
    })
};

module.exports.validatePortfolio = function(portfolio) {

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_portfolio", 
            						portfolio: portfolio});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

		    if (data["error"] == "") {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(new Error(data["error"]));
		    } else {
		    	reject(new Error("Unknown error in validating portfolio"));
		    }
	    });
    })
};

module.exports.updateStockStaticPerformanceDetail = function(q, security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_static_performance", 
            						security: security});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			
        	if (data["error"] == "" && data["performance"]) {
			    resolve(data["performance"]);
		    } else if (data["error"] != "") {
		    	reject(new Error(data["error"]));
		    } else {
		    	reject(new Error("Unknown error in computing stock static performance detail"));
		    }
	    });
    })
    .then(performance => {
    	return SecurityPerformanceModel.updateStaticPerformance(q, performance);
    });
};

module.exports.updateStockRollingPerformanceDetail = function(q, security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_rolling_performance", 
            						security: security});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {

        	var data = JSON.parse(msg);
        	if (data["error"] == "" && data["performance"]) {
			    resolve(data["performance"]);
		    } else if (data["error"] != "") {
		    	reject(new Error(data["error"]));
		    } else {
		    	reject(new Error("Unknown error in computing stock rolling performance detail"));
		    }
	    });
    })
    .then(performance => {
    	return SecurityPerformanceModel.updateRollingPerformance(q, performance);
    })
};

module.exports.updateStockPriceHistory = function(q, security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_price_history", 
            						security: security});
         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			console.log(data);

        	if (data["error"] == "" && data["priceHistory"]) {
			    resolve(data["priceHistory"]);
		    } else if (data["error"] != "") {
		    	reject(new Error(data["error"]));
		    } else {
		    	reject(new Error("Unknown error in computing stock price history"));
		    }
	    });
    })
    .then(priceHistory => {
    	//here change the datatype before saving to database
    	if(priceHistory) {
    		priceHistory = priceHistory.map(item => {
    			item.date = new Date(item.date).getTime()/1000;
    			return item; 
    		});
    		
    		return SecurityPerformanceModel.updatePriceHistory(q, priceHistory);
		} else {
			APIError.throwJsonError({message: "Invalid price history data. Can't update!!"});
		}
    });
};

module.exports.updateStockLatestDetail = function(q, security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_price_latest", 
            						security: security});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

        	if (data["error"] == "" && data["latestDetail"]) {
			    resolve(data["latestDetail"]);
		    } else if (data["error"] != "") {
		    	reject(new Error(data["error"]));
		    } else {
		    	reject(new Error("Unknown error in computing stock latest detail"));
		    }
	    });
    })
    .then(latestDetail => {
    	return SecurityPerformanceModel.updateLatestDetail(q, latestDetail);
    });
};
