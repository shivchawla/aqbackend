/*
* @Author: Shiv Chawla
* @Date:   2018-03-02 11:39:25
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-17 23:03:23
*/
'use strict';
const AdviceModel = require('../../models/Marketplace/Advice');
const AdviceHelper = require('./Advice');
const PerformanceHelper = require('./Performance');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const APIError = require('../../utils/error');
const WebSocket = require('ws'); 
const config = require('config');
const Promise = require('bluebird');
const DateHelper= require('../../utils/Date');
var ObjectId = require('mongoose').Types.ObjectId;

function _findDateIndex(dateArray, date) {
	return dateArray.map(item => new Date(item).getTime()).indexOf(new Date(date).getTime());
}

function _hasAdviceChanged(myPositions, adviceId) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio', populate: 'portfolio'})
	.then(advice => {
		var changed = false;
		if (advice && advice.portfolio && advice.portfolio.detail) {
			var advicePositions = advice.portfolio.detail.positions;
			var tickersInAdvice = advicePositions.map(item => item.security.ticker);
			var tickersInPortfolio  = myPositions.map(item => item.security.ticker);
			var allTickers = Array.from(new Set(tickersInPortfolio.concat(tickersInAdvice)));

			for (var ticker of allTickers) {
				//find postions in myPositions
				
				var idxInPositions = myPositions.map(item => item.security.ticker).indexOf(ticker);
				var idxInAdvice = advicePositions.map(item => item.security.ticker).indexOf(ticker);
				if ((idxInPositions == -1 && idxInAdvice != -1)  || (idxInPositions != -1 && idxInAdvice == -1)) {
					changed = true;
					break;
				} else {
					changed == myPositions[idxInPositions].quantity != advicePositions[idxInAdvice].quantity;

					if (changed == true) {
						break;
					} 
				}
			}
		} 

		return changed;
	});
}

function _computePnlStats(positions) {
	var totalPnl = 0.0;
	var pnlPct = 0.0;
	var cost = 0.0;
	var netValue = 0.0;
	positions.forEach(item => {
		cost += item.quantity * item.avgPrice;
		totalPnl += item.quantity * (item.lastPrice - item.avgPrice);
		netValue += item.quantity * item.lastPrice;
	});

	pnlPct = cost > 0.0 ? totalPnl/cost : 0.0;

	var x = {pnl: totalPnl, pnlPct: pnlPct, cost: cost, netValue: netValue};
	return x;
}

function _getUniqueAdvices(portfolio) {
	var subPositions = portfolio && portfolio.detail && portfolio.detail.subPositions ? portfolio.detail.subPositions : []; 
	return Array.from(new Set(subPositions.map(item => {return item.advice ? item.advice._id.toString() : "";})));
};

function _getAdvicePerformanceInPortfolio(portfolio, adviceId) {
	var advicePositions = portfolio && portfolio.detail && portfolio.detail.subPositions ? portfolio.detail.subPositions.filter(item => {return adviceId!="" ? item.advice && item.advice._id && item.advice._id.toString() == adviceId.toString() : !item.advice || item.advice=="";}) : [];
	return Promise.all([
		adviceId !="" ? PerformanceHelper.getAdvicePerformanceSummary(adviceId) : {current: {}},
		_computePnlStats(advicePositions),
		adviceId !="" ? _hasAdviceChanged(advicePositions, adviceId) : false
	])
	.then(([performance, pnlStats, hasChanged]) => {
		return Object.assign({advice: adviceId}, performance.current, {hasChanged: hasChanged}, {personal: pnlStats});
	});
};

function _getAdviceStats(portfolio, userId) {

	var uniqueAdvices = _getUniqueAdvices(portfolio);
    	
	return Promise.map(uniqueAdvices, function(adviceId) {
    	return Promise.all([
    		_getAdvicePerformanceInPortfolio(portfolio, adviceId),
    		adviceId != "" && userId ? AdviceHelper.computeAdviceSubscriptionDetail(adviceId, userId) : {}
		])
		.then(([advicePerformance, adviceSubscriptionDetail]) => {
			return Object.assign(advicePerformance, adviceSubscriptionDetail);
		}) 
	})
	.then(allAdvicePerformances => {
		var totalValue = portfolio && portfolio.detail && portfolio.detail.cash ? portfolio.detail.cash : 0.0;
		allAdvicePerformances.forEach(item => {
			totalValue += item.personal.netValue;
		});

		allAdvicePerformances.forEach(item => {
			item.personal.weightInPortfolio = item.personal.netValue/totalValue;
		});

		return allAdvicePerformances;
	})
}

function _filterPortfolioForAdvice(portfolio, adviceId) {
	var advicePositions = portfolio && 
						portfolio.detail && 
						portfolio.detail.subPositions ? 
						portfolio.detail.subPositions.filter(item => {return item.advice && item.advice._id!="" && item.advice._id.toString() == adviceId.toString()}) :
						[];

	return {positions: advicePositions};
}

function _populateWeights(portfolio) {
	return new Promise(resolve => {
		var port = Object.assign({}, portfolio);
		var totalVal = port.detail.cash;
		var positions = port.detail.positions;

		positions.forEach(item => {
		 	totalVal += item.quantity*item.lastPrice;
		});

		positions.map(item => {
			var weight = totalVal > 0.0 ? (item.quantity*item.lastPrice)/totalVal : 0.0;
			item.weightInPortfolio = weight;
			return item;
		});

		resolve(port);
	});
}

function _populateAdvice(portfolio) {
	return new Promise(resolve => {
		if (portfolio) {
			var subPositions = portfolio.detail.subPositions;
			
			return Promise.map(subPositions, function(subPosition) {
				if (subPosition.advice) {
					return AdviceModel.fetchAdvice({_id: subPosition.advice}, {fields: 'name _id'})
					.then(advice => {
						subPosition.advice = advice;
						return subPosition;
					})
				} else {
					return subPosition;
				}
			})
			.then(updatedSubPositions => {
				portfolio.detail.subPositions = updatedSubPositions;
				resolve(portfolio);
			})
		} else {
			resolve(null);
		}
	});
}

function _updatePortfolioForSplitsAndDividends(portfolio, startDate, endDate) {
	//Julia computes the updated portfolio	
	//HEAVY DUTY WORK IS DONE BY JULIA
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);

	        var msg = JSON.stringify({action:"update_portfolio_splits_dividends", 
        								portfolio: portfolio,
        								startDate: startDate,
        								endDate: endDate}); 

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	if(data['portfolioHistory'] && data["error"] == "") {
    			resolve(data['portfolioHistory']);
			} else if(data["error"] != "") {
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error in updating positions for transactions", errorCode: 2101}));
			}
		});
	});
}

function _computeUpdatedPortfolioForSplitsAndDividends(portfolio, startDate, endDate) {
	return new Promise(resolve => {
		Promise.all([
			_updatePortfolioForSplitsAndDividends(portfolio.detail, startDate, endDate),
			
			//Each subposition is sent separately as JULIA portfolio can't handle 
			//redundant securities
			Promise.map(portfolio.detail.subPositions, function(position) {
				return _updatePortfolioForSplitsAndDividends({positions: [position]}, startDate, endDate)
			})
		])
		.then(([historyUpdatedPortfolio, listHistoryUpdatedSubPortfolios]) => { 
			if(historyUpdatedPortfolio || historyUpdatedSubPortfolio) {
				var updatedPortfolio = Object.assign({}, portfolio);

				var trueHistory = [];
				//Initial empty portoflio comes here twice

				for (let history of historyUpdatedPortfolio) {
					var startDate = history.startDate;
					var endDate = history.endDate;
					
					var subPositions = [];
					for (let subPortfolioHistory of listHistoryUpdatedSubPortfolios) {
						var sIdx = subPortfolioHistory.map(item => new Date(item.startDate).getTime()).findIndex(it => it >= new Date(startDate).getTime()); 
						var eIdx = subPortfolioHistory.map(item => new Date(item.startDate).getTime()).findIndex(it => it <= new Date(endDate).getTime()); 

						let mIdx;
						if (sIdx != -1 || eIdx != -1) {
							//Choose the maximum of the index
							mIdx  = sIdx != -1 && eIdx != -1 ? Math.max(sIdx, eIdx) : sIdx != -1 ? sIdx : eIdx;
						}

						if (mIdx != -1) {
							subPositions.push.apply(subPositions, subPortfolioHistory[mIdx].positions)
						} else {
							console.log("This shouldn't happen");
						}
					}

					history.subPositions = subPositions;

					trueHistory.push({detail: history});
				}

				
				resolve(trueHistory);
			} else {
				resolve([portfolio]);
			}
			
		})
		.catch(err => {
			console.log(err);
			resolve([portfolio]);
		})
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

	let allPortfolioHistory = [];
	var reducerArray = [initialPortfolio].concat(tsByDates);

	return Promise.reduce(reducerArray, function(startPortfolio, tso) {
		var transactionsByDay = tso.transactions;
			
		return _computeUpdatedPortfolioForSplitsAndDividends({detail: startPortfolio}, DateHelper.getDate(startPortfolio.startDate), DateHelper.getDate(transactionsByDay[0].date))
		.then(updatedHistoricalPortfolios => {
			//Push all split/dividend adjusted portfolios to history
			allPortfolioHistory.push.apply(allPortfolioHistory, updatedHistoricalPortfolios.slice(0, -1));
			var nextPortfolio = updatedHistoricalPortfolios.slice(-1)[0]
			return _computeUpdatedPortfolioForStockTransactionsEachDate(nextPortfolio.detail, transactionsByDay)
		})
		.then(newPortfolio => {

			var lastDate = new Date(transactionsByDay[0].date);
			var lastTransactionDate = new Date(transactionsByDay[0].date);

			//Push a portfolio to history
			//var lastPortfolio = Object.assign({}, startPortfolio);
			//Last portfolio's endDate is one day before the transaction day 
			//lastDate = new Date(lastDate.setDate(lastDate.getDate() - 1));
			//lastPortfolio.endDate = lastDate;
			//allPortfolioHistory.push(lastPortfolio);
				
			newPortfolio.startDate = lastTransactionDate;

			return newPortfolio;
		
		});
	})
	.then(finalPortfolio => {
		return _computeUpdatedPortfolioForSplitsAndDividends({detail: finalPortfolio}, DateHelper.getDate(finalPortfolio.startDate), DateHelper.getCurrentDate())
	})
	.then(finalPortfolioHistory => {
		//Push all split/dividend adjusted portfolios to history
		allPortfolioHistory.push.apply(allPortfolioHistory, finalPortfolioHistory);
		return [allPortfolioHistory.slice(-1)[0], allPortfolioHistory];
	})
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

				resolve(updatedPortfolio);
			} else {
				resolve(portfolio);
			}
			
		})
		.catch(err => {
			resolve(portfolio);
		})
	});
}


//NOT IN USE
function _computeUpdatedPortfolioDetailForSplitsAndDividends(portfolioDetail, date) {
	return new Promise(resolve => {
		if (!(portfolioDetail && portfolioDetail.positions)) {
				console.log("No Positions");
				console.log(portfolioDetail)
			}

		Promise.all([
			_updatePortfolioForSplitsAndDividends(portfolioDetail, date)
			.then(updates => { //contains updted positions, cashgenerates and haschanged flag
				return [updates.updatedPortfolio, updates.hasChanged];
			}),

			//Each subposition is sent separately as JULIA portfolio can't handle 
			//redundant securities
			Promise.map(portfolioDetail.subPositions, function(position) {
				const port = {positions: [position], cash: 0.0};
				return _updatePortfolioForSplitsAndDividends(port, date)
				.then(updates => { //updates include (cashgenerated , positions and isChanged flag)
					if (updates.updatedPortfolio && updates.updatedPortfolio.positions){
						return updates.updatedPortfolio.positions.length == 1 ? updates.updatedPortfolio.positions[0] : null;
					} else {
						return null;
					}
				});
			})
			//null,
		])
		.then(([[updatedPortfolioDetail, hasChanged], updatedSubPositions]) => {
			if(hasChanged) {

				updatedPortfolioDetail.startDate = DateHelper.getCurrentDate();

				if(updatedSubPositions) {
					//Filter out the NULL values
					updatedPortfolioDetail.subPositions = updatedSubPositions.filter(item => item);
				}

				resolve([hasChanged, updatedPortfolioDetail]);
			} else {
				resolve([false, portfolioDetail]);
			}
		})
		.catch(err => {
			console.log(err);
			resolve([false, portfolioDetail]);
		});
	});
}

//Compute Portfolio Analytics
module.exports.computePortfolioAnalytics = function(portfolioId) {
	return exports.getPortfolioForDate(portfolioId)
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

//Updates portfolio for transactions
module.exports.updatePortfolioForStockTransactions = function(portfolio, transactions, action, preview) {
	
	//LOGIC
	//1. Insert new transactions
	//2a. Create portfolio by going over all the transactions 
	//if new transaction dates are older than existing transactions
	//2b. Update current portfolio if the transactions are new
	var updateMethod = 'Create';
	var portfolioId = portfolio._id;
	var uniqueAdviceIds = Array.from(new Set(transactions.map(item => item.advice ? item.advice.toString() : "")));
	return Promise.map(uniqueAdviceIds, function(adviceId) {
		if (adviceId != "") {
			var transactionsForAdviceId = transactions.filter(item => {return item.advice == adviceId;});
			
			//TRANSACTION WITH ADVICE_ID are just like stock transaction 
			//but have adviceId  
			//1. Get Transactions for a date
			var uniqueDates = Array.from(new Set(transactionsForAdviceId.map(item => new Date(item.date).getTime()))).map(item => new Date(item)).sort();
			//2. Filter out transaction for the date
			return Promise.map(uniqueDates, function(date){

				var transactionsForAdviceIdForDate = transactionsForAdviceId.filter(item => {return DateHelper.compareDates(item.date, date) == 0;});
				
				return exports.getAdvicePortfolio(adviceId, date)
				.then(advicePortfolio => {
					if(advicePortfolio) {
						  
						//3. Validate transactions against advice portfolio as of that date
						var investorCurrentPortfolioInAdvice = _filterPortfolioForAdvice(portfolio, adviceId);
						return exports.validateTransactions(transactionsForAdviceIdForDate, advicePortfolio.detail, investorCurrentPortfolioInAdvice)
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
				var initialPortfolio = {positions: [], subPositions: [], cash: 0.0, startDate: DateHelper.getDate("1900-01-01")};
				return _computeUpdatedPortfolioForStockTransaction(initialPortfolio, portfolio.transactions.filter(item => {return !item.deleted}));
			} else if (updateMethod == "Append") {
				//Updating the date format
				transactions.map(item => {item.date = new Date(item.date); return item});
				return _computeUpdatedPortfolioForStockTransaction(portfolio.detail, transactions);
			}
		}
	})
	.then(([updatedPortfolio, completeHistory])  => {
		if(!preview) {
			const updates = {};
			updates.detail = updatedPortfolio.detail;
			//Take the last component out of the history
			updates.history = completeHistory.slice(0, -1).map(item => item.detail);
			//Update portfolio and portfolio history
			return PortfolioModel.updatePortfolio({_id: portfolioId}, updates, {new: true, appendHistory: updateMethod == "Append"}) 
			.then(updated => {
				return exports.getUpdatedPortfolioForPrice(portfolioId);
			});
		} else {

			//In case of Preview!!!!
			return _computeUpdatedPortfolioForPrice(updatedPortfolio)
			.then(portfolio => {
				return _populateWeights(portfolio)	
			})
			.then(portfolio => {
				return _populateAdvice(portfolio);
			});	
		}
	})
	.then(portfolio => {
		return _getAdviceStats(portfolio)
		.then(advicePerformance => {
			return Object.assign({advicePerformance : advicePerformance}, portfolio ? portfolio : {});	
		});
	})
};

//Update portfolio for prices for any date
module.exports.computeUpdatedPortfolioForPrice = function(portfolio, date, type) {
	
	return _computeUpdatedPortfolioForPrice(portfolio, date, type)
	.then(latestPricePortfolio => {
		return _populateWeights(latestPricePortfolio);
	})
	.then(portfolio => {
		return _populateAdvice(portfolio);
	});
};

//Gets portfolio for a specific date (Date could be in the history)
module.exports.getPortfolioForDate = function(portfolioId, options, date) {
	
	var __fields = options && options.fields ? options.fields : "";
	__fields = __fields.concat(" detail history");

	var __date = !date || date =="" ? DateHelper.getCurrentDate() : DateHelper.getDate(date);

	let __detail;
 	
 	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields: __fields})
 	.then(portfolio => {
        if (portfolio) {
            var portfolioDetail = portfolio.detail;
            //If Date is greater than or equal to current portfolio startDate
            if (DateHelper.compareDates(__date, DateHelper.getDate(portfolioDetail.startDate)) != -1) {
                __detail = portfolioDetail;
            } else {

	            for(var historicalDetail of portfolio.history){
	                //If Date is greater than or equal to historical portfolio startDate
	                //AND
	                //Date is less than historical portfolio endDate
	                if (DateHelper.compareDates(__date, DateHelper.getDate(historicalDetail.startDate)) != -1 && 
	                        DateHelper.compareDates(DateHelper.getDate(historicalDetail.endDate), __date) != -1) {
	                    __detail = historicalDetail;
	                    break;
	                } 
	            }
            }

            var __portfolio = Object.assign({}, portfolio.toObject());

            delete __portfolio.detail;
            delete __portfolio.history;

            return  Object.assign(__portfolio, {detail: __detail ? __detail.toObject() : null});

        } else {
        	APIError.throwJsonError({portfolioId: portfolioId, message: "Portfolio not found", errorCode: 1401});	
        }

    });
};

module.exports.getUpdatedPortfolioForPrice = function(portfolioId, options, type) {
	return exports.getPortfolioForDate(portfolioId, options)
	.then(portfolio => {
		if(portfolio) {
			return portfolio.detail ? exports.computeUpdatedPortfolioForPrice(portfolio, DateHelper.getCurrentDate(), type) :  null;
		} else {
			APIError.throwJsonError({portfolioId: portfolioId, message: `Error getting portfolio for date: ${DateHelper.getCurrentDate()}`});
		}
	})
};

module.exports.getUpdatedPortfolioForEverything = function(portfolioId, options, userId) {
	return exports.getUpdatedPortfolioForPrice(portfolioId, options)
	.then(portfolio => {
		//This fucntion need to be takn out of here but how???
		return _getAdviceStats(portfolio, userId)
		.then(advicePerformance => {
			return Object.assign({advicePerformance: advicePerformance}, portfolio ? portfolio : {});
		});	
	});
};

//Gets the portfolio history till a specific date (Date could be in the history)
module.exports.getPortfolioHistory = function(portfolioId, date, options) {
	
	var __fields = options && options.fields ? options.fields : "";
	__fields = __fields.concat(" detail history");

	var __date = !date || date =="" ? DateHelper.getCurrentDate() : DateHelper.getDate(date);

	let __history = [];
 	
 	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields: __fields})
 	.then(portfolio => {
        if (portfolio) {

            var portfolioDetail = portfolio.detail;
            //If Date is greater than or equal to current portfolio startDate
            if (DateHelper.compareDates(__date, DateHelper.getDate(portfolioDetail.startDate)) != -1) {
                __history.push(portfolioDetail)
            }

            for(var historicalDetail of portfolio.history) {
                //If Date is greater than the start Date of historical portfolios
                //ADD
                if (DateHelper.compareDates(__date, DateHelper.getDate(historicalDetail.startDate)) != -1) {
                    __history.push(historicalDetail)
                } 
            }

            var __portfolio = Object.assign({}, portfolio);

            delete __portfolio.history;
            delete __portfolio.detail;

            return  Object.assign(__portfolio, {history: __history});
        } else {
        	return null;
        }

    });
};

//Get current portfolio with realtime prices
module.exports.getUpdatedPortfolioForRtPrice = function(portfolioId) {
	//Append new fields to some basic fields (ADD SPACE - V. IMP)
	return exports.getUpdatedPortfolioForPrice(portfolioId, {fields: 'detail'}, "RT");
}

//Validate portfolio
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

//Validate transactions
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


//NOT IN USE --- needs to be be changed for newer setup
module.exports.updatePortfolioForSplitsAndDividends = function(portfolioId) {
	var currentDate = DateHelper.getCurrentDate();

	return exports.getPortfolioForDate(portfolioId, {fields: 'detail adjustmentHistory'})
	.then(portfolio => {
		//Check if currentDate already exist in adjustmentHistory
		var alreadyAdjusted = portfolio.adjustmentHistory ? portfolio.adjustmentHistory.map(item => item.getTime()).indexOf(currentDate.getTime()) != -1 : false;

		if (portfolio && portfolio.detail && !alreadyAdjusted) {
			return _computeUpdatedPortfolioDetailForSplitsAndDividends(portfolio.detail, currentDate.toISOString());
		} else {
			return [false, null];
		}
	})
	.then(([updated, updatedDetail]) => {
		//If updated flag is TRUE, then only update the portfolio
		//ELSE return NULL
		//this update needs to be changed
		return updated && updatedDetail ? PortfolioModel.updatePortfolio({_id: portfolioId}, {detail: updatedDetail, adjustmentHistory: currentDate}, {updateHistory: true}) : null;
	});
};

module.exports.getAllPortfoliosForDate = function(date, fields) {
	return PortfolioModel.fetchPortfolios({}, {_id: 1})
	.then(portfolios => {
		return Promise.map(portfolios, function(portfolio) {
			exports.getPortfolioForDate(portfolio._id, {fields: fields}, date);
		});
	});
}

module.exports.updateAllPortfoliosForSplitsAndDividends = function() {
	return exports.getAllPortfoliosForDate()
	.then(portfolios => {
		Promise.mapSeries(portfolios, function(portfolio) {
			return exports.updatePortfolioForSplitsAndDividends(portfolio._id);
		});
	});
};

module.exports.getAdvicePortfolio = function(adviceId, date) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {portfolio:1})
	.then(advice => {
		if (advice) {
			return exports.getPortfolioForDate(advice.portfolio, {fields: 'detail'}, date);
		} else {
			APIError.throwJsonError({message: "Advice not found"});
		}
	});
};

