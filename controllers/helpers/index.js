/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 13:06:04
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-05-26 15:10:04
*/

'use strict';
const AdvisorModel = require('../../models/advisor');
const InvestorModel = require('../../models/investor');
const AdviceModel = require('../../models/advice');
const UserModel = require('../../models/user');

exports.isAdvicePersonal = function(userId, adviceId) {

	//const userId = args.userId.value;
	//const adviceId = args.adviceId.value;

	UserModel.fetchUser({_id:userId})
 	.then(user =>{
 		if(user) {
 			return AdvisorModel.getAdvisor({_id: user.advisor}, {fields:'advices'});
 		} else {
 			return null;
 		}	
 	})
 	.then(advices => {
 		if(advices) {
 			if(advices.indexOf(adviceId) !=-1) {
 				return true;
 			}
 		}

 		return false;
 	});
};

exports.isAdviceFollowing = function(userId, adviceId) {

	//const userId = args.userId.value;
	//const adviceId = args.adviceId.value;

	UserModel.fetchUser({_id:userId})
 	.then(user =>{
 		if(user) {
 			return AdvisorModel.getInvestor({_id: user.investor}, {fields:'followingAdvices'});
 		} else {
 			return null;
 		}	
 	})
 	.then(advices => {
 		if(advices) {
 			if(advices.indexOf(adviceId) !=-1) {
 				return true;
 			}
 		}

 		return false;
 	});
};

exports.isAdviceSubscribed = function(userId, adviceId) {

	//const userId = args.userId.value;
	//const adviceId = args.adviceId.value;

	UserModel.fetchUser({_id:userId})
 	.then(user =>{
 		if(user) {
 			return AdvisorModel.getInvestor({_id: user.investor}, {fields:'subscribedAdvices'});
 		} else {
 			return null;
 		}	
 	})
 	.then(advices => {
 		if(advices) {
 			if(advices.indexOf(adviceId) !=-1) {
 				return true;
 			}
 		}

 		return false;
 	});
};

exports.getUpdatedAdviceSummary = function(adviceId) {
	const options = {};
    options.fields = 'portfolioStats performanceMetrics createdDate updatedDate approved';

	return AdviceModel.getAdvice({_id: adviceId}, options)
 	.then(advice => {
 		if (advice) {
			return updateAdviceWithPerformance(advice);
		} else {
			return res.status(400).json({message:'No advice found'});
		}
 	})
 	.then(advice => {
 		return res.status(200).json(advice);
	});
};

exports.updatePortfolioTransactions = function(portfolioId, transactions) {
	
	const updates = {};
	return PortfolioModel.getPortfolio({_id: portfolioId}, 'positions')
	.then(portfolio => {
		if(portfolio) {
			var positions = portfolio.positions;

			// Send exisitng positions and transactions to Julia
			// Get back updated positions 

			return Promise.all([_updatePositions(positions, transactions),
								TransactionModel.addTransactions(transactions)]);
								
		}
	})
	.then(([updatedPositions, transactionIds]) => {
		updates.positions = updatedPositions;
		updates.transactions = transactionIds;
		//In update Portfolio, the 
		return PortfolioModel.updatePortfolio({_id:portfolioId}, updates);
	})
	.then(portfolio => {

	})
};

exports.deletePortfolio = function(portfolioId) {
	const updates = {};
	updates.deleted = true;
	updates.updatedDate = new Date();

	return PortfolioModel.updatePortfolio({_id:portfolioId}, updates);
};

exports.updateAdviceWithPerformance = function(advice) {
	return updateAdviceWithCurrentPortfolioPerformance(advice)
	.then(advice => {
		return updateAdviceWithAdvicePerformance(advice);
	});
};

exports.updateAdviceWithCurrentPortfolioPerformance = function(advice) {
		
	var needPerformanceUpdate = false;
	var endDate = new Date();

	if (advice.currentPerformance) {
		
		var lastUpdatedDate = advice.currentPerformance.lastUpdatedDate;

		lastUpdatedDate.setDate(lastUpdatedDate.getDate() + 1);

		var today = new Date();
		today.setHours(0, 0, 0, 0);

		if(today.getTime() > lastUpdatedDate.getTime()) {
			needPerformanceUpdate = true;
			endDate = today;
		}
	}

	if (needPerformanceUpdate) {
		var portfolio = advice.currentPortfolio;
		var startDate = advice.currentPerformance.lastUpdatedDate;
		var benchmark = advice.benchmark;
		
		var updates = {};
		
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

				return AdviceModel.updateAdviceCurrentPortfolioPerformance({_id: investor.id}, updates);
			}
		});	
	}
};

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

	        var msg = JSON.stringify({action:"compute_updated_portfolio", 
        								positions: positions,
        								transactions: transactions}); 

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	wsClient.close();

	    	if(data['error'] == '' && data['positions']) {
    			resolve(data['positions']);
			} else {
				resolve(null);
			}
		});
	});
}


