/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 13:06:04
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-22 10:17:56
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
					subPortfolio.positions.map(position => {
						position["advice"] = adviceId!= "" ? ObjectId(adviceId) : null;
						return position
					});
					
					return subPortfolio;
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

module.exports.computeConstituentPerformance = function(portfolio, startDate, endDate, benchmark) {
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
};

module.exports.computePortfolioComposition = function(portfolio, startDate, endDate, benchmark) {
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
};

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

module.exports.updatePositionsForLatestPrice = function(positions) {
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
};

function _computePortfolioRating (portfolioId) {
	return PerformanceModel.fetchPerformance({portfolio: portfolioId})
	.then(performance => {
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
			APIError.throwJsonError({portfolioId: portfolioId, message: "Performance not available"});
		}
	});
};

function _computeAggregateRating (adviceIds) {
	return Promise.map(adviceIds, function(adviceId) {
		return AdviceModel.fetchAdvice({_id: adviceId}, {fields:'portfolio analytics'}, {populate: 'portfolio'});
	})
	.then(advices => {
		if (advices) {
			//FIND a logic to combine all ratings
			return 0.5;
		} else {
			APIError.throwJsonError({message: "Advices not available while computing aggregate ratings"});
		}
	});
}

function updateAdvisorAnalytics(advisorId) {
	return Promise.all([
		AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: '_id subscribers followers'}),
		AdviceModel.fetchAdvices({advisor: advisorId, deleted: false, public: true}, {fields:'_id'})])
	.then(([advisor, advices]) => {
		if(advisor && advices) {
			return {
				date: getDate(new Date()),
				numSubscribers: advisor.subscribers.filter(item => {return item.active == true;}).length,
				numFollowers: advisor.followers.filter(item => {return item.active == true;}).length,
				rating: _computeAggregatedRating(advices),
				numAdvices: advices.length
			};
		} else {
			if(!advisor) {
				APIError.throwJsonError({advisor: advisorId, message: "Advisor not found while updating analytics"});
			} else if(!advices) {
				APIError.throwJsonError({advisor: advisorId, message: "Null advices for advisor"});
			}
		}
	})
	.then(advisorAnalytics => {
		return AdvisorModel.updateAnalytics({_id: advisorId}, advisorAnalytics.analytics);
	});
}

function updateAllAdvisorAnalytics() {
	return AdvisorModel.fetchAdvisors({}, {fields: '_id'})
	.then(advisors => {
		if (advisors) {
			return Promise.map(advisors, function(advisor) {
				return updateAdvisorAnalytics(advisor._id);
			});
		} else {
			APIError.throwJsonError({message: "Advisors not found while updating analytics"});
		}
	});
}

function updateAdviceAnalytics(adviceId) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: '_id portfolio subscribers followers'})
	.then(advice => {
		if (advice) {
			return {
				date: getDate(new Date()),
				numSubscribers: advice.subscribers.filter(item => {return item.active == true}).length,
				numFollowers: advice.followers.filter(item => {return item.active == true}).length,
				rating: _computePortfolioRating(advice.portfolio)
			};
		} else {
			APIError.throwJsonError({advice: adviceId, message: "Advice not found while updating analytics"});
		}
	})
	.then(adviceAnalytics => {
		return AdviceModel.updateAnalytics({_id: adviceId}, adviceAnalytics.analytics);
	});
}

function updateAllAdviceAnalytics() {
	return AdviceModel.fetchAdvices({deleted: false}, {fields: '_id'})
	.then(advices => {
		if (advices) {
			return Promise.map(advices, function(advice) {
				return updateAdviceAnalytics(Advice._id);
			});
		} else {
			APIError.throwJsonError({message: "Advices not found while updating analytics"});
		}
	});
};

module.exports.getDate = function(dateTime) {
	return new Date(dateTime.toDateString());
};
