/*
* @Author: Shiv Chawla
* @Date:   2018-03-02 11:39:25
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-02 16:17:30
*/
'use strict';
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const APIError = require('../../utils/error');
const WebSocket = require('ws'); 
const config = require('config');
const Promise = require('bluebird');
const DateHelper= require('../../utils/Date');
var ObjectId = require('mongoose').Types.ObjectId;

function _filterPortfolioForAdvice(portfolio, adviceId) {
	var advicePositions = portfolio && 
						portfolio.detail && 
						portfolio.detail.subPositions ? 
						portfolio.detail.subPositions.filter(item => {return item.advice && item.advice._id!="" && item.advice._id.toString() == adviceId.toString()}) :
						[];

	return {positions: advicePositions};
}

function _updatePortfolioWeights(portfolio) {
	var portfolio = Object.assign({}, portfolio);
	var totalVal = portfolio.detail.cash;
	var positions = portfolio.detail.positions;

	positions.forEach(item => {
	 	totalVal += item.quantity*item.lastPrice;
	});

	positions.forEach(item => {
		item.weightInPortfolio = totalVal > 0.0 ? (item.quantity*item.lastPrice)/totalVal : 0.0;
	});

	return portfolio;
}

function _updatePortfolioForSplitsAndDividends(portfolio) {
	//Julia computes the updated portfolio	
	//HEAVY DUTY WORK IS DONE BY JULIA
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);

	        //WHy Cash == 0.0: So that output portfolio has cash generated
	        const portfolio = {
	        	positions: positions,
	        	cash: 0.0
	        };

	        var msg = JSON.stringify({action:"update_portfolio_splits_dividends", 
        								portfolio: portfolio}); 

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	if(data['updates'] && data["error"] == "") {
    			resolve(data['updates']);
			} else if(data["error"] != "") {
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error in updating positions for transactions", errorCode: 2101}));
			}
		});
	});
}		

//Common function to handle stock and stock/advice transactions
function _computeUpdatedPortfolioForStockTransaction(initialPortfolio, allTransactions) {
	
	//Creating vector of unique dates
	//by comparing getTime() component of date
	var dates = Array.from(new Set(allTransactions.map(item => {return item.date.getTime()}))).map(item => new Date(item));

	//Aggregating transactions by the date
	var tsByDates = []
	//First convert dates to numeric value and then sort
	dates.map(item => {return item.getTime()}).sort().forEach(date => {
		var ts = allTransactions.filter(transaction => {return transaction.date.getTime() == date;});
		tsByDates.push({transactions: ts});
	});

	let history = [];
	var reducerArray = [initialPortfolio].concat(tsByDates);

	return Promise.reduce(reducerArray, function(startPortfolio, tso) {
		var transactionsByDay = tso.transactions;
		
		return _computeUpdatedPortfolioForStockTransactionsEachDate(startPortfolio, transactionsByDay)
		.then(newPortfolio => {
			
			var lastDate = new Date(transactionsByDay[0].date);
			var lastTransactionDate = new Date(transactionsByDay[0].date);

			//Push a portfolio to history
			var lastPortfolio = Object.assign({}, startPortfolio);
			//Last portfolio's enddate is one day before the transaction day 
			lastDate = new Date(lastDate.setDate(lastDate.getDate() - 1));
			lastPortfolio.endDate = lastDate;

			history.push(lastPortfolio);
				
			//Update the start portfolio
			//startPortfolio = newPortfolio;
			//startPortfolio.startDate = lastTransactionDate;
			newPortfolio.startDate = lastTransactionDate;

			return newPortfolio;
		
		});
	})
	.then(finalPortfolio => {
		return [finalPortfolio, history];
	});
}

function _computeUpdatedPortfolioForStockTransactionsEachDate(portfolio, transactions) {
	
	var unionAdviceIds = transactions.map(item => item.advice).concat(portfolio.subPositions.map(item => item.advice)).map(item => {return item ? item.toString() : ""});
	var uniqueAdviceIds = Array.from(new Set(unionAdviceIds));

	return Promise.all([
		//PROMISE 1: Update Positions
		_updatePositionsForTransactions(portfolio.positions, transactions),
		
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
				return _updatePositionsForTransactions(subPositionsForAdviceId, transactionsForAdviceId)
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
				return {positions: subPositionsForAdviceId};
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

function _updatePositionsForTransactions(positions, transactions) {
	
	//SEND all the transactions and current positions to Julia server 
	//Julia computes the updated portfolio	
	//HEAVY DUTY WORK IS DONE BY JULIA
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);

	        //WHy Cash == 0.0: So that output portfolio has cash generated
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
	    	if(data['portfolio'] && data["error"] == "") {
    			resolve(data['portfolio']);
			} else if(data["error"] != "") {
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error in updating positions for transactions", errorCode: 2101}));
			}
		});
	});
}

function _updatePositionsForPrice(positions, date, type) {
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
	            						portfolio: portfolio,
	            						date: !date || date == "" ? "" : date,
	            						type: type ? type : "EOD"});
	         	wsClient.send(msg);
	        });

	        wsClient.on('message', function(msg) {
	        	var data = JSON.parse(msg);

	        	if (data["error"] == "" && data["updatedPositions"]) {
				    resolve(data["updatedPositions"]);
			    } else if (data["error"] != "") {
			    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			    } else {
			    	reject(APIError.jsonError({message: "Internal error in updating portfolio for latest price", errorCode: 2101}));
			    }
		    });
	    })
	} else {
		APIError.throwJsonError({message:"Invalid positions: Can't update positions for latest price"});
	}
}

function _computeUpdatedPortfolioForPrice(portfolio, date, type) {
	return new Promise(resolve => {
		Promise.all([
			_updatePositionsForPrice(portfolio.detail.positions, date, type),
			
			//Each subposition is sent separately as JULIA portfolio can't handle 
			//redundant securities
			Promise.map(portfolio.detail.subPositions, function(position) {
				return _updatePositionsForPrice([position], date, type)
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

				resolve([true, updatedPortfolio]);
			} else {
				resolve([false, portfolio]);
			}
			
		})
		.catch(err => {
			//console.log(err);
			resolve([false, portfolio]);
		})
	});
}

function _computeUpdatedPortfolioDetailForSplits(portfolioDetail, date) {
	return new Promise(resolve => {
		Promise.all([
			_updatePositionsForSplitsAndDividends(portfolioDetail.positions, date)
			.then(updates => { //contains updted positions, cashgenerates and haschanged flag
				return [updates.cashgenerated, updates.positions, updates.hasChanged];
			}),

			//Each subposition is sent separately as JULIA portfolio can't handle 
			//redundant securities
			Promise.map(portfolioDetail.subPositions, function(position) {
				return _updatePositionsForSplitsAndDividends([position], date)
				.then(updates => { //updates include (cashgenerated , positions and isChanged flag)
					if (updates.positions){
						return updates.positions.length == 1 ? updated.positions[0] : null;
					} else {
						return null;
					}
				});
			})
		])
		.then(([[cashgen, updatedPositions, hasChanged], updatedSubPositions]) => {
			if(hasChanged) {
				var updatedPortfolioDetail = Object.assign({}, portfolioDetail);
				
				if(updatedPositions) {
					updatedPortfolioDetail.positions = updatedPositions;
				}

				if (cashgen) {
					updatedPortfolioDetail.cash += cashgen;
				}
				
				if(updatedSubPositions) {
					//Filter out the NULL values
					updatedPortfolioDetail.subPositions = updatedSubPositions.filter(item => item);
				}

				resolve([hasChanged, updatedPortfolio]);
			} else {
				resolve([false, portfolioDetail]);
			}
		});
	});
}

module.exports.computePortfolioAnalytics = function(portfolioId) {
	return exports.getUpdatedPortfolio(portfolioId, 'detail')
	.then(portfolio => {
		var positions = portfolio && portfolio.detail ? portfolio.detail.positions : [];
		var distinctSectors = Array.from(new Set(positions.map(item => {return item && item.security && item.security.detail ? item.security.detail.Sector : "";}).filter(item => {return item && item != ""})));
		var distinctIndustries = Array.from(new Set(positions.map(item => {return item && item.security && item.security.detail ? item.security.detail.Industry : "";}).filter(item => {return item && item != ""})));
		
		return {
			nstocks: positions.length,
			sectors: distinctSectors,
			industries: distinctIndustries
		}; 
	});
};

module.exports.updatePortfolioForStockTransactions = function(portfolio, transactions, action, preview) {
	
	//LOGIC
	//1. Insert new transactions
	//2a. Create portfolio by going over all the transactions 
	//if new transaction dates are older than existing transactions
	//2b. Update current portfolio if the transactions are new
	var updateMethod = 'Create';
	var portfolioId = portfolio._id;

	var uniqueAdviceIds = Array.from(new Set(transactions.map(item => item.advice)));
	
	return Promise.map(uniqueAdviceIds, function(adviceId){
		if (adviceId) {
			var transactionsForAdviceId = transactions.filter(item => {return item.advice == adviceId;});
			
			//TRANSACTION WITH ADVICE_ID are just like stock transaction 
			//but have adviceId  
			//1. Get Transactions for a date
			var uniqueDates = Array.from(new Set(transactionsForAdviceId.map(item => new Date(item.date).getTime()))).map(item => new Date(item)).sort();

			//2. Filter out transaction for the date
			return Promise.map(uniqueDates, function(date){

				var transactionsForAdviceIdForDate = transactionsForAdviceId.filter(item => {return DateHelper.compareDates(item.date, date) == 0;});
				
				return AdviceModel.fetchAdvicePortfolio({_id: adviceId}, date)
				.then(advicePortfolio => {
					if(advicePortfolio) {
						
						//3. Validate transactions against advice portfolio as of that date
						var investorCurrentPortfolioInAdvice = _filterPortfolioForAdvice(portfolio, adviceId);
						return exports.validateTransactions(transactionsForAdviceIdForDate, advicePortfolio, investorCurrentPortfolioInAdvice)
						.catch(err => {
							APIError.throwJsonError({message: "Invalid transactions (Reason: " + err.message +")", advice: adviceId, date: date, errorCode: 1406});
						});
					} else {
						APIError.throwJsonError({message: "Validation failed for transactions - Portfolio not found", advice: adviceId, date: date, errorCode: 1401});
					}
				});
			})
			.then(validFlags => {
				return validFlags.every(function(item){return item;})
			})
		} else {
			var onlyStockTransactions = transactions.filter(item => {return !item.advice});
			return exports.validateTransactions(onlyStockTransactions)
			.catch(err => {
				APIError.throwJsonError({message: "Invalid transactions (Reason: "+ err.message +")", errorCode: 1406});
			});
		}
	})
	.then(validFlags => {

		//TO BE IMPORVED: TRANSACTIONS SHOULD BE ADDED/DELETED/UPDATED
		//after portfolio update process
		if (validFlags.every(function(item){return item;}) && portfolio) {

			if(action == "update") {
				//Check if transaction has "_id" field, 
				//This means MODIFY existing transaction
				//IF YES, then "create" portfolio from scratch
				return PortfolioModel.updateTransactions({_id: portfolioId, deleted: false}, transactions);

			} else if(action == "delete") {
				return PortfolioModel.deleteTransactions({_id: portfolioId, deleted: false}, transactions);

			} else {
				var oldTransactions = portfolio.transactions ? portfolio.transactions : [];
				var nTransactions = oldTransactions.length;
				if(nTransactions > 0) {
					//sort transaction by date
					oldTransactions.sort((item1, item2) => {
						return DateHelper.compareDates(item1, item2);
					});

					//get the last transaction's date
					var lastDateOld = new Date(oldTransactions[nTransactions -1].date);

					//Also, sort the new transactions by dates
					//First convert to JS dates from string dates
					transactions.sort((item1, item2) => {
						return DateHelper.compareDates(item1, item2);
					});

					//get first transaction date
					var firstDateNew = transactions[0].date;

					//If earliest date of new transaction is hgher than latest date of old transactions,
					//then APPEND
					if (DateHelper.compareDates(firstDateNew, lastDateOld) == 1) {
						updateMethod = 'Append';
					}
				}

				if (!preview) {
					return PortfolioModel.addTransactions({_id: portfolioId, deleted: false}, transactions)
				} else {
					updateMethod = "Create";

					const np = Object.assign({}, portfolio);
					var originalTransactions = np.transactions ? np.transactions : [];

					return {transactions: originalTransactions.concat(transactions), 
							detail: portfolio.detail
						};
				}
			}
		} else {
			APIError.throwJsonError({message: "Invalid transactions", errorCode: 1406})
		}
	})
	.then(portfolio => { //Has updated transaction but portfolio is STALE
		if(portfolio) {
			if (updateMethod == "Create") {
				var initialPortfolio = {positions: [], subPositions: [], cash: 0.0};
				return _computeUpdatedPortfolioForStockTransaction(initialPortfolio, portfolio.transactions.filter(item => {return !item.deleted}));
			} else if (updateMethod == "Append") {
				//Updating the date format
				transactions.map(item => {item.date = new Date(item.date); return item});
				return _computeUpdatedPortfolioForStockTransaction(portfolio.detail, transactions);
			}
		}
	})
	.then(([updatedPortfolioForTransactions, history]) => {
		return Promise.all([_computeUpdatedPortfolioForPrice({detail:updatedPortfolioForTransactions}), history])
	})
	.then(([[priceUpdated, updatedPortfolio], history]) => {
		if(!preview) {
			const updates = {};
			updates.detail = updatedPortfolio.detail;
			updates.history = history;

			return PortfolioModel.updatePortfolio({_id:portfolioId}, updates, {new: true, fields:'name detail benchmark updatedDate'}, updateMethod == "Append");
		} else {
			//POPULATE ADVICE NAME - 05/03/2018
			return Promise.map(updatedPortfolio.detail.subPositions, function(position) {
				if (position.advice) {
					 return AdviceModel.fetchAdvice({_id: position.advice}, {fields:'_id name'})
					 .then(advice => {
					 	position.advice = advice;
					 	return position;
					 });

				} else {
					return position;
				}
			}).then(updatedSubPositions => {
				updatedPortfolio.detail.subPositions = updatedSubPositions;
				return updatedPortfolio;
			});
		}
	});
};

module.exports.computeUpdatedPortfolioForPrice = function(portfolio, date) {
	
	return _computeUpdatedPortfolioForPrice(portfolio, date);
};

module.exports.getUpdatedPortfolio = function(portfolioId, fields) {
	//Append new fields to some basic fields (ADD SPACE - V. IMP)
	return PortfolioModel.fetchPortfolio({_id: portfolioId, deleted:false}, {fields:'detail updatedDate'})
	.then(portfolio => {
		if(portfolio) {
			var updateRequired = portfolio.updatedDate ? DateHelper.getDate(portfolio.updatedDate) < DateHelper.getCurrentDate() : true;
			return updateRequired ? 
				_computeUpdatedPortfolioForPrice(portfolio.toObject()):
				[false,  portfolio];
		} else {
			APIError.throwJsonError({portfolioId: portfolioId, message: "Portfolio not found", errorCode: 1401});
		}
	})
	.then(([updated, latestPricePortfolio]) => {
		return updated ? PortfolioModel.updatePortfolio({_id: portfolioId}, latestPricePortfolio, {fields: fields}) : latestPricePortfolio;
	})
	.then(latestPricePortfolio => {
		return _updatePortfolioWeights(latestPricePortfolio.toObject());
	});
};

module.exports.getUpdatedPortfolioForRtPrices = function(portfolioId) {
	//Append new fields to some basic fields (ADD SPACE - V. IMP)
	return PortfolioModel.fetchPortfolio({_id: portfolioId, deleted:false}, {fields:'detail'})
	.then(portfolio => {
		if(portfolio) {
			return _computeUpdatedPortfolioForPrice(portfolio.toObject(), null, "RT");
		} else {
			APIError.throwJsonError({portfolioId: portfolioId, message: "Portfolio not found", errorCode: 1401});
		}
	})
	.then(([updated, latestPricePortfolio]) => {
		if(updated) {
			//Async updates the data base
			PortfolioModel.updatePortfolio({_id: portfolioId}, latestPricePortfolio, {});
		}

		//continues with output
		return latestPricePortfolio;
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
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error in comparing portfolios", errorCode: 2101}));
			}
		});
	});
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
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Unknown error in validating portfolio", errorCode: 2101}));
		    }
	    });
    })
};

module.exports.validateTransactions = function(transactions, advicePortfolio, investorPortfolio) {

	//Addding a checking for valid transaction date (05-03-2018)
	var tomorrow = DateHelper.getCurrentDate();
	tomorrow.setDate(tomorrow.getDate()+1);
	transactions.forEach(transaction => {
		if (DateHelper.compareDates(transaction.date, tomorrow) != -1) {
			APIError.throwJsonError({message: "Illegal Transactions. Transactions later than today are not allowed", errorCode: 1410});
		}
	});

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_transactions", 
            						transactions: transactions,
        							advicePortfolio: advicePortfolio ? advicePortfolio : "",
        							investorPortfolio: investorPortfolio ? investorPortfolio : ""});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

		    if (data["error"] == "" && data["valid"]) {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error in validating transactions", errorCode: 2101}));
		    }
	    });
    })
};

module.exports.updatePortfolioForSplitsAndDividends = function(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields: 'detail'})
	.then(portfolio => {
		if (portfolio && portfolio.detail) {
			return _computeUpdatedPortfolioDetailForSplits(portfolio.detail);
		} else {
			return [false, null];
		}
	})
	.then(([updated, updateDetail]) => {
		return PortfolioModel.updatePortfolio({_id: portfolioId}, {detail: updatedDetail}, {}, updated)
	})
};
