/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 13:06:04
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-01 12:34:20
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const UserModel = require('../../models/user');
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const APIError = require('../../utils/error');
const config = require('config');
const WebSocket = require('ws'); 
const Promise = require('bluebird');
var ObjectId= require('mongoose').Types.ObjectId;

function _compareIds(x, y) {
	if(!x && !y) {
		return true;
	} else if(!x || !y) {
		return false;
	} else {
		return x.equals(y);
	}
}

function _compareDates(d1, d2) {
	var t1 = new Date(d1).getTime();
	var t2 = new Date(d1).getTime();

	return (t1 < t2) ? -1 : (t1 == t2) ? 0 : 1;
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

	        //WHy Cash == 0.0: So that output potfolio has cash generated
	        const portfolio = {
	        	positions: positions,
	        	cash: 0.0
	        };

	        var msg = JSON.stringify({action:"update_portfolio_transactions", 
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

function _updatePositionsForLatestPrice(positions) {
	if (positions) {
		return new Promise((resolve, reject) => {

			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			const portfolio = {
				positions: positions,
				cash: 0.0
			};

			wsClient.on('open', function open() {
	            console.log('Connection Open');
	            console.log(connection);
	            var msg = JSON.stringify({action:"update_portfolio_price", 
	            						portfolio: portfolio});
	         	wsClient.send(msg);
	        });

	        wsClient.on('message', function(msg) {
	        	var data = JSON.parse(msg);

	        	if (data["error"] == "" && data["updatedPositions"]) {
				    resolve(data["updatedPositions"]);
			    } else if (data["error"] != "") {
			    	reject(new Error(data["error"]));
			    } else {
			    	reject(new Error("Unknown error in updating portfolio for latest price"));
			    }
		    });
	    })
	} else {
		APIError.throwJsonError({message:"Invalid positions: Can't update positions for latest price"});
	}
}

module.exports.compareDates = function(date1, date2) {
	return _compareDates(date1, date2);
};

module.exports.computeUpdatedPortfolioForLatestPrice = function(portfolio) {
	return Promise.all([
		_updatePositionsForLatestPrice(portfolio.detail.positions),
		
		//Each subposition is sent separately as JULIA portfolio can't handle 
		//redundant securities
		Promise.map(portfolio.detail.subPositions, function(position) {
			return _updatePositionsForLatestPrice([position])
			.then(updatedPositions => {
				if (updatedPositions){
					return updatedPositions.length == 1 ? updatedPositions[0] : null;
				} else {
					return null;
				}
			});
		})
	])
	.then(([updatedPositions, updatedSubPositions]) => { 
		
		if(updatedPositions || updatedSubPositions) {
			var updatedPortfolio = Object.assign({}, portfolio);
			
			if(updatedPositions) {
				updatedPortfolio.detail.positions = updatedPositions;
			}
			
			if(updatedSubPositions) {
				//Filter out the NULL values
				updatedPortfolio.detail.subPositions = updatedSubPositions.filter(item => item);
			}

			return [true, updatedPortfolio];
		} else {
			return [false, portfolio];
		}
		
	});
};

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
	
	var unionAdviceIds = transactions.map(item => item.advice).concat(portfolio.subPositions.map(item => item.advice)).map(item => {return item ? item.toString() : ""});
	var uniqueAdviceIds = Array.from(new Set(unionAdviceIds));

	return Promise.all([
		//PROMISE 1: Update Positions
		_updatePositions(portfolio.positions, transactions),
		
		//PROMISE 2: Update Sub-Positions
		Promise.map(uniqueAdviceIds, function(adviceId) {
			
			var transactionsForAdviceId = transactions.filter(item => {
				var tId = item.advice ? item.advice.toString() : "";
				return tId == adviceId;
			}); 	

			var subPositionsForAdviceId = portfolio.subPositions.filter(item => {
				var tId = item.advice ? item.advice.toString() : "";
				return tId == adviceId;
			}); 

			if (transactionsForAdviceId.length > 0) {
				return _updatePositions(subPositionsForAdviceId, transactionsForAdviceId)
				.then(subPortfolio => {
					return {
						positions: 
							subPortfolio.positions.map(position => {
								position["advice"] = adviceId!= "" ? ObjectId(adviceId) : null;
								return position;
							})
						};
				});	
			} else  {
				return {positions : subPositionsForAdviceId};
			}		
		})
	])
	.then(([fullPortfolio, subPortfolios]) => {
		var subPositions = [];
		subPortfolios.forEach(subPortfolio => {
			subPositions = subPositions.concat(subPortfolio.positions);
		});

		const updatedPortfolio = {
			positions: fullPortfolio.positions,
			subPositions: subPositions,
			cash: portfolio.cash + fullPortfolio.cash
		};

		return updatedPortfolio;
	});
}

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

module.exports.validateTransactions = function(transactions, portfolio) {

	return new Promise((resolve, reject) => {
		resolve(true);
	});	

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_transactions", 
            						transactions: transactions,
        							portfolio: portfolio});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

		    if (data["error"] == "" && data["valid"]) {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(new Error(data["error"]));
		    } else {
		    	reject(new Error("Unknown error in validating transactions"));
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
    	if(priceHistory) {	
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

module.exports.getDate = function(dateTime) {
	return new Date(dateTime.toDateString());
};
