/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 13:06:04
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-07-01 12:15:40
*/

'use strict';
const AdvisorModel = require('../../models/advisor');
const InvestorModel = require('../../models/investor');
const AdviceModel = require('../../models/advice');
const PortfolioModel = require('../../models/portfolio');
const UserModel = require('../../models/user');
const APIError = require('../../utils/error');
const config = require('config');
const WebSocket = require('ws'); 
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

exports.calculatePerformanceAndUpdateInvestor = function(investorId, portfolioId) {
	
	return PortfolioModel.fetchPortfolio({_id: portfolioId},{})
	.then(portfolio => {
		var portfolioHistory = [{startDate: portfolio.startDate, 
									endDate: new Date(), 
									portfolio: {
										positions: portfolio.positions,
										cash: portfolio.cash}
									}];

		if(portfolio.history) {							
			portfolio.history.forEach(port => {
				portfolioHistory.push({startDate: port.startDate, 
										endDate: port.endDate,
										portfolio: {
											positions: port.positions,
											cash: port.cash}
										});
			});
		}

		return computePerformance(portfolioHistory, {ticker:"CNX_NIFTY"});
	})
	.then(performance => {

		if(performance) {
			performance["updatedDate"] = new Date();
			performance.portfolioStats = performance.portfolioStats.map(item => { 
				  item.date = new Date(item.date); 
				  return item;
			});
			return InvestorModel.updateInvestorPerformance({_id: investorId}, portfolioId, performance);
		}
	})

};


exports.calculatePerformanceAndUpdateAdvice = function(adviceId) {
	
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio benchmark'})
	.then(advice => {
		var portfolioHistory = [{startDate: advice.portfolio.startDate, 
								endDate: new Date(), 
								portfolio: {
									positions: advice.portfolio.positions,
									cash: advice.portfolio.cash}
								}];

		if(advice.portfolio.history) {
			advice.portfolio.history.forEach(port => {
				portfolioHistory.push({startDate: port.startDate, 
									endDate: port.endDate,
									portfolio: {
										positions: port.positions,
										cash: port.cash}
									});
			});
		}
	
		return computePerformance(portfolioHistory, advice.benchmark);
	})
	.then(performance => {
		console.log("Hola");
		console.log(performance);
		if(performance) {
			performance["updatedDate"] = new Date();
			performance.portfolioStats = performance.portfolioStats.map(item => { 
				  item.date = new Date(item.date); 
				  return item;
			});
			return AdviceModel.updateAdvice({_id: adviceId}, {advicePerformance:performance});
		}
	});
};


/*exports.fetchUpdatedAdviceSummary = function(adviceId) {
	const options = {};
    options.fields = 'name description advicePerformance createdDate updatedDate advisor public approved';

	return AdviceModel.fetchAdvice({_id: adviceId}, options)
 	.then(advice => {
 		if (advice) {
			return advice; //updateAdviceWithPerformance(advice);
		} else {
			APIError.thowJsonError({message:'No advice found'});
		}
 	})
};*/

exports.updatePortfolioForStockTransactions = function(portfolioId, transactions) {
	
	const updates = {};
	
	return PortfolioModel.fetchPortfolio({_id: portfolioId, deleted: false}, {fields: 'positions subPositions cash'})
	.then(portfolio => {
		if(portfolio) {
			//var positions = portfolio.positions;

			//var subPositions = portfolio.subPositions.filter(position => {
			//	position.advice == null});

			// Send exisitng positions and transactions to Julia
			// Get back updated positions 
			return _updatePortfolio(portfolio, transactions, null);
							
		} else {
			APIError.thowJsonError({portfolioId: portfolioId, msg: "Portfolio not found"});
		}
	})
	.then(updatedPortfolio => {

		console.log("halala");
		console.log(updatedPortfolio);
	
		updates.positions = updatedPortfolio.positions;
		updates.subPositions = updatedPortfolio.subPositions;
		updates.cash = updatedPortfolio.cash;
		updates.transactions = transactions;
		return PortfolioModel.updatePortfolio({_id:portfolioId}, updates);
	})

};

exports.updatePortfolioForAdviceTransactions = function(portfolioId, adviceId) {
	
	const updates = {};
	
	return Promise.all([PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'positions subPositions cash advices'}),
						AdviceModel.fetchAdvice({_id: adviceId}, {fields:'portfolio'})])	
	.then(([portfolio, advice]) => {
		if(portfolio && advice.portfolio) {

			if(portfolio.advices.indexOf(adviceId) !=-1) {
				APIError.throwJsonError({adviceId: adviceId, msg:"Advice already part of the portfolio"});
			}

			var subPositions = portfolio.subPositions.filter(item => {return _compareIds(item.advice, adviceId);});

			var transactions = [];

			//GO over all the positions in advice portfoli
			// and find out if we need to transact the advice
			// advice could already be present
			advice.portfolio.positions.forEach(position => {
				
				var originalQty = 0;
				if(subPositions){
					var idx = subPositions.indexOf(item => {item.security.equals(position.security)});
				
					if(idx !=-1) {
						originalQty = subPositions[idx].quantity;
					}
				}

				var transaction = {
					security: position.security,
					quantity: position.quantity - originalQty,
					price: 0,
					date: new Date()
				};

				transactions.push(transaction);

			});
			// Send exisitng positions and transactions to Julia
			// Get back updated positions 

			return _updatePortfolio(portfolio, transactions, adviceId);							
		}
	})
	.then(updatedPortfolio => {
		updates.positions = updatedPortfolio.positions;
		updates.subPositions = updatedPortfolio.subPositions;
		updates.cash = updatedPortfolio.cash;
		updates.advices = adviceId;
		
		return PortfolioModel.updatePortfolio({_id:portfolioId}, updates);
	});
};

exports.deletePortfolio = function(portfolioId) {
	const updates = {};
	updates.deleted = true;
	updates.updatedDate = new Date();

	return PortfolioModel.updatePortfolio({_id:portfolioId}, updates);
};


exports.fetchUpdatedAdvice = function(query, options) {

}

/*exports.updateAdviceWithCurrentPortfolioPerformance = function(advice) {
	
	console.log("_updateAdviceWithCurrentPortfolioPerformance(advice)");

	var needPerformanceUpdate = false;
	var endDate = new Date();

	if (advice.currentPortfolio.performanceMetrics) {

		var nMetrics = advice.currentPortfolio.performanceMetrics.length;

		if(nMetrics > 0) {
			var lastUpdatedDate = advice.currentPortfolio.performanceMetrics[nMetrics -1].date;
		
			//TODO : FINANCIAL Calendar

			if (lastUpdatedDate.getTime() < advice.currentPortfolio.endDate.getTime()) {

				lastUpdatedDate.setDate(lastUpdatedDate.getDate() + 1);

				var today = new Date();
				today.setHours(0, 0, 0, 0);

				if(today.getTime() > lastUpdatedDate.getTime()) {
					needPerformanceUpdate = true;
					if(advice.currentPortfolio.endDate.getTime() > today.getTime()) {
						endDate = today;
					} else {
						endDate = advice.currentPortfolio.endDate;
					}
				}
			}
		} else {
			needPerformanceUpdate = true;
			endDate = advice.currentPortfolio.endDate;
		}

	} else {
		console.log("Hola");
		needPerformanceUpdate = true;
		endDate = advice.currentPortfolio.endDate;
	}

	return new Promise(function(resolve, reject) {
		if(needPerformanceUpdate) {

			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);
		        console.log("khf:: compute_portfolio_value");
		        var msg = JSON.stringify({action:"compute_portfolio_value_period", 
		        				portfolio: advice.currentPortfolio.portfolio, startDate:advice.currentPortfolio.startDate, endDate:endDate});

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	//console.log("result");
		    	//console.log(data);

		    	if(data['error'] == '' && data['netValue']) {
		    		
		    		//console.log("mohammad");
		    		//console.log(data);

		    		// reformat date to JS
		    		resolve(AdviceModel.updateCurrentPortfolioPortfolioStats(advice._id, data['netValue']));
		    		
				} else {
					resolve(advice);
				}
			});
		} else {
			return resolve(advice);
		}
	})
	.then(advice => {
		return new Promise(function(resolve, reject) {
			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);
		        var msg = JSON.stringify({action:"compute_performance_netvalue", 
		        				netValue: advice.currentPortfolio.portfolioStats.map(x=>x.netValue),
		        				dates: advice.currentPortfolio.portfolioStats.map(x=>x.date),
		        				benchmark: advice.benchmark});

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	//console.log("dfdfd");
		    	//console.log(data);

		    	if(data['error'] == '' && data['performance']) {
		    		
		    		//console.log(data);

		    		// reformat date to JS
		    		resolve(AdviceModel.updateCurrentPortfolioPerformance(advice._id, data['performance']));
		    		
				} else {
					resolve(advice);
				}
			});
			 
		});
	});
};*/

exports.updateAdviceWithAdvicePerformance = function(advice) {
		
	console.log("Here");		
	var needPortfolioValueUpdate = false;
	var endDate = new Date();

	if (advice.performance) {
		
		var lastUpdatedDate = advice.performance.lastUpdatedDate;

		lastUpdatedDate.setDate(lastUpdatedDate.getDate() + 1);

		var today = new Date();
		today.setHours(0, 0, 0, 0);

		if(today.getTime() > lastUpdatedDate.getTime()) {
			needPortfolioValueUpdate = true;
			endDate = today;
		}
	}
		
	if (needPortfolioValueUpdate) {
		var portfolio = advice.currentPortfolio;
		var startDate = advice.performance.lastUpdatedDate;
		var benchmark = advice.benchmark;
		
		var updates = {};
		
		//ASSUMPTION: Portfolio didn't change..
		//HOW TO FIX:
		//ONE WAY: To send complete portfolio history from start to endDate

		return computePortfolioStats(portfolio, startDate, endDate)
		.then(portfolioStats => {
			if(portfolioStats) {
				updates.portfolioStats = portfolioStats;
				return computePortfolioPerformance(portfolioStats, benchmark);
			}
		})
		.then(performance => { 
			if (performance) {
				updates.performance = performance;
				updates.lastUpdatedDate = today;

				return AdviceModel.updateAdvicePerformance({_id: investor.id}, updates);
			}
		});	
	}
};

/*
f(){
	return new Promise(function(resolve, reject) {
		if (needPortfolioValueUpdate) {
		// Create websocket connection and 
		// ask Julia process to compute the 
		// performance
		
			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);

		        var msg = JSON.stringify({action:"compute_portfolio_value_history", 
	        								portfolioHistory: advice.portfolioHistory}); 

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	if(data['error'] == '' && data['netValue']) {
		    		
		    		console.log(data);
	    			resolve(AdviceModel.updateAdvicePortfolioStats(advice._id, data['netValue']));
		    		
				} else {
					resolve(advice);
				}
			});
		
		} else {
			resolve(advice);
		}
	})
	.then(advice => {
		return new Promise(function(resolve, reject) {

			var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
			var wsClient = new WebSocket(connection);

			wsClient.on('open', function open() {
		        console.log('Connection Open');
		        console.log(connection);

		        var msg = JSON.stringify({action:"compute_performance_netvalue", 
	        								netValue: advice.portfolioStats.map(x=>x.netValue),
	        								dates: advice.portfolioStats.map(x=>x.date),
	        								benchmark: advice.benchmark}); 

		     	wsClient.send(msg);
		    });

		    wsClient.on('message', function(msg) {
		    	var data = JSON.parse(msg);
		    	wsClient.close();

		    	if(data['error'] == '' && data['performance']) {
		    		
		    		//console.log(data);

	    			resolve(AdviceModel.updateAdvicePerformance(advice._id, data['performance']));
		    		
				} else {
					resolve(advice);
				}
			});

		});
	});
}; */

exports.updateInvestorPortfolioPerformance = function(investor) {
	var needPerformanceUpdate = false;
	var endDate = new Date();

	if (investor.performance) {

		var nMetrics = investor.performance.metrics.length;
		var lastUpdatedDate = investor.performance.lastUpdatedDate;

		// Is this necessary
		lastUpdatedDate.setDate(lastUpdatedDate.getDate() + 1);

		var today = new Date();
		today.setHours(0, 0, 0, 0);

		//TODO : FINANCIAL Calendar

		if(today.getTime() > lastUpdatedDate.getTime()) {
			needPerformanceUpdate = true;
			endDate = today;
		}

		/*if(nMetrics > 0) {
			var lastUpdatedDate = investor.currentPortfolio.performanceMetrics[nMetrics - 1].date;
		
			//lastUpdatedDate.setDate(lastUpdatedDate.getDate() + 1);
			
			if(today.getTime() > lastUpdatedDate.getTime()) {
				needPerformanceUpdate = true;
				endDate = today;
			}
		} else if (today.getTime() > investor.currentPortfolio.startDate.getTime()) {
			needPerformanceUpdate = true;
			endDate = today;
		}*/
	}
	


	if(needPerformanceUpdate) {
		
		/******
		//TRICKY: Is the portfolio consistent from start to end dates
		// OR the portfoli changed as well
		******/

		var portfolio = investor.portfolio;
		var startDate = investor.performance.lastUpdatedDate
		var benchmark = investor.portfolio.benchmark;
		
		var updates = {};
		
		return computePortfolioStats(portfolio, startDate, endDate)
		.then(portfolioStats => {
			if(portfolioStats) {
				updates.portfolioStats = portfolioStats;
				return computePortfolioPerformance(portfolioStats, benchmark);
			}
		})
		.then(performance => { 
			if (performance) {
				updates.performance = performance;
				updates.lastUpdatedDate = today;

				return InvestorModel.updatePortfolioPerformance({_id: investor.id}, updates);
			}
		});
		
	}
};

function _computePortfolioStats(portfolio, startDate, endDate) {
	
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        console.log("khf:: compute_portfolio_value");
	        var msg = JSON.stringify({action:"compute_portfolio_value_period", 
	        				portfolio: portfolio, startDate:startDate, endDate:endDate});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	wsClient.close();

	    	//console.log("result");
	    	//console.log(data);

	    	if(data['error'] == '' && data['netValue']) {
	    		// reformat date to JS
	    		resolve(data['netValue']);
	    		
			} else {
				//find out what REJECT() does
				resolve(null);
			} 
		});
    });
}

function _computePortfolioPerformance(portfolioStats, benchmark) {

	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);

	        var msg = JSON.stringify({action:"compute_performance_netvalue", 
        								netValue: portfolioStats.map(x=>x.netValue),
        								dates: portfolioStats.map(x=>x.date),
        								benchmark: benchmark}); 

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	wsClient.close();

	    	if(data['error'] == '' && data['performance']) {
    			resolve(data['performance']);
			} else {
				resolve(null);
			}
		});

	});
}

function _compareIds(x, y) {
	if(!x && !y) {
		return true;
	} else if(!x || !y) {
		return false;
	} else {
		return x.equals(y)
	}

}

function _updatePortfolio(portfolio, transactions, adviceId) {
	
	var subPositions = portfolio.subPositions.filter(item => {
			return _compareIds(item.advice, adviceId);}); 	

	console.log("SUB");
	console.log(subPositions);
			
	return Promise.all([_updatePositions(subPositions, transactions),
						_updatePositions(portfolio.positions, transactions)
						])
	.then(([port2, port1]) => {

		/*console.log("port1");
		console.log(port1);
		console.log("port2");
		console.log(port2);*/

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

		console.log(updatedPortfolio);
		return updatedPortfolio;
	})
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
	    	console.log("WTF");
	    	console.log(data);
	    	wsClient.close();

	    	if(data['portfolio']) {
    			resolve(data['portfolio']);
			} else {
				resolve(null);
			}
		});
	});
}

/*function _updateSubPositions(subPositions, transactions, adviceId) {
	
	//SEND all the transactions and current positions to Julia server 
	//Julia computes the updated portfolio	
	//HEAVY DUTY WORK IS DONE BY JULIA

	//Filter positions by adviceId
	var positions = subPositions.filter(item => {
		item.advice.equals(adviceId)
	});

	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);

	        const portfolio = {
	        	positions: subPositions;
	        	cash: 0.0;
	        };

	        var msg = JSON.stringify({action:"compute_updated_portfolio", 
        								portfolio: portfolio,
        								transactions: transactions}); 

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	wsClient.close();

	    	if(data['error'] == '' && data['portfolio']) {
    			
    			resolve(data["portfolio"]);
			} else {
				resolve(null);
			}
		});
	});
}*/

exports.validateAdvice = function(advice) {

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_advice", 
            						advice: advice});

            console.log(advice);

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	console.log('On validation message');
        	console.log(msg);

        	var data = JSON.parse(msg);
			
			console.log(data);
        	
        	wsClient.close();

        	if (data["valid"] == true) {
			    resolve(true);
		    } else {
		    	resolve(false)
		    }
	    });
    })
};

exports.validatePortfolio = function(portfolio) {

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_portfolio", 
            						portfolio: portfolio});

            console.log(portfolio);

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	console.log('On validation message');
        	console.log(msg);

        	var data = JSON.parse(msg);
			
			console.log(data);
        	
        	wsClient.close();

        	if (data["valid"] == true) {
			    resolve(true);
		    } else {
		    	resolve(false)
		    }
	    });
    })
};



