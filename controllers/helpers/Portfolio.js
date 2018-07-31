/*
* @Author: Shiv Chawla
* @Date:   2018-03-02 11:39:25
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-07-31 21:02:08
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
const WSHelper = require('./WSHelper');
const _ = require('lodash');

function _findDateIndex(dateArray, date) {
	return dateArray.map(item => new Date(item).getTime()).indexOf(new Date(date).getTime());
}

/*
* Function to check if advice portfolio is different from version of advice user has in portfolio
*/
function _hasAdviceChanged(myPositions, adviceId) {
	return exports.getAdvicePortfolio(adviceId)
	.then(advicePortfolio => {
		var changed = false;
		if (advicePortfolio && advicePortfolio.detail) {
			var advicePositions = advicePortfolio.detail.positions;
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
					changed = myPositions[idxInPositions].quantity != advicePositions[idxInAdvice].quantity;

					if (changed == true) {
						break;
					} 
				}
			}
		} 

		return changed;
	});
}

function _computePnlStats(portfolioDetail, isAdvice) {
	var totalPnl = 0.0;
	var totalPnlPct = 0.0;
	var cost = 0.0;
	var netValue = 0.0;
	var cash = portfolioDetail.cash;
	portfolioDetail.positions.forEach(item => {
		cost += item.quantity * item.avgPrice;
		totalPnl += item.quantity * (item.lastPrice - item.avgPrice) + (item.dividendCash ? item.dividendCash : 0.0);
		netValue += item.quantity * item.lastPrice + (isAdvice ? 0.0 : portfolioDetail.cash);
	});

	totalPnlPct = cost > 0.0 ? totalPnl/cost : 0.0;

	return {totalPnl: totalPnl, totalPnlPct: totalPnlPct, cost: cost, netValue: netValue, cash: cash};
}

function _getUniqueAdvices(portfolio) {
	var subPositions = portfolio && portfolio.detail && portfolio.detail.subPositions ? portfolio.detail.subPositions : []; 
	return Array.from(new Set(subPositions.map(item => {return item.advice ? item.advice._id.toString() : "";})));
};

function _getAdvicePerformanceInPortfolio(portfolio, adviceId) {
	var advicePositions = portfolio && portfolio.detail && portfolio.detail.subPositions ? portfolio.detail.subPositions.filter(item => {return adviceId!="" ? item.advice && item.advice._id && item.advice._id.toString() == adviceId.toString() : !item.advice || item.advice=="";}) : [];
	return Promise.all([
		adviceId !="" ? PerformanceHelper.getAdvicePerformanceSummary(adviceId) : {current: {}},
		_computePnlStats({positions: advicePositions, cash: 0.0}, true),
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


/*
* Populate pnl stats, netvalue, unrealized Pnl for the portfolio (and individual positions)
*/
function _populateStats(portfolio, isAdvice) {

	return new Promise(resolve => {
		var port = Object.assign({}, portfolio);
		
		//Added logic to exclude the cash from advice composition
		var totalVal = isAdvice ? 0.0 : port.detail.cash;
		var positions = port.detail.positions;

		positions.forEach(item => {
		 	totalVal += item.quantity*item.lastPrice;
		});

		positions.map(item => {
			var weight = totalVal > 0.0 ? (item.quantity*item.lastPrice)/totalVal : 0.0;
			item.weightInPortfolio = weight;
			//Added unrealized PnL (and %).
			item.unrealizedPnl = item.avgPrice > 0 ? (item.lastPrice - item.avgPrice)*item.quantity: 0.0;
			item.unrealizedPnlPct = item.avgPrice > 0 ? (item.lastPrice - item.avgPrice)/item.avgPrice : 0.0;
			
			return item;
		});

		var pnlStats = _computePnlStats(port.detail, isAdvice);

		resolve(Object.assign(port, {pnlStats: pnlStats}));
	});
}

function _populateAdvice(portfolio) {
	return new Promise(resolve => {
		if (portfolio) {
			var subPositions = _.get(portfolio, 'detail.subPositions', []);
			
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

/*
* Internal Function: Sends request to Julia to update portfolio (portfolio history) for average price
* Used while populating average price for advice portfolio
*/
function _updatePortfolioForAveragePrice(portfolioHistory) {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"update_portfolio_average_price", 
    								portfolioHistory: portfolioHistory});
        								
		WSHelper.handleMktRequest(msg, resolve, reject);

	});
}

function _updatePortfolioForSplitsAndDividends(portfolio, startDate, endDate) {
	//Julia computes the updated portfolio	
	//HEAVY DUTY WORK IS DONE BY JULIA
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"update_portfolio_splits_dividends", 
        								portfolio: portfolio,
        								startDate: startDate,
        								endDate: endDate}); 

		WSHelper.handleMktRequest(msg, resolve, reject);

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
				//Initial empty portfolio comes here twice

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
							console.log("Adjusting for splits:..This shouldn't happen");
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
			console.log("Error while adjusting portfolio for splits/dividends")
			console.log(err.message);
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

			//Update the Date format
			updatedHistoricalPortfolios.forEach(item => {
				item.detail.startDate = DateHelper.getDate(item.detail.startDate);
				item.detail.endDate = DateHelper.getDate(item.detail.endDate);
			});

			//Push all split/dividend adjusted portfolios to history
			//Resolved BUG (01-06-2018)[Last element of history was not added]
			allPortfolioHistory.push.apply(allPortfolioHistory, updatedHistoricalPortfolios);
			var nextPortfolio = updatedHistoricalPortfolios.slice(-1)[0]
			return _computeUpdatedPortfolioForStockTransactionsEachDate(nextPortfolio.detail, transactionsByDay)
		})
		.then(newPortfolio => {

			var lastDate = DateHelper.getDate(transactionsByDay[0].date);
			var lastTransactionDate = DateHelper.getDate(transactionsByDay[0].date);

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
		//Update the date format
		finalPortfolioHistory.forEach(item => {
			item.detail.startDate = DateHelper.getDate(item.detail.startDate);
			item.detail.endDate = DateHelper.getDate(item.detail.endDate);
		});

		//Push all split/dividend adjusted portfolios to history
		allPortfolioHistory.push.apply(allPortfolioHistory, finalPortfolioHistory);

		return [allPortfolioHistory.slice(-1)[0], allPortfolioHistory];
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
	//Julia computes the updated portfolio	con
	//HEAVY DUTY WORK IS DONE BY JULIA
	return new Promise(function(resolve, reject) {
		var msg = JSON.stringify({action:"update_portfolio_transactions", 
        								portfolio: {positions: positions},
        								transactions: transactions}); 

		WSHelper.handleMktRequest(msg, resolve, reject);

	});
}

function _updatePositionsForPrice(positions, type, date) {
	if (positions) {
		return new Promise((resolve, reject) => {

			var msg = JSON.stringify({action:"update_portfolio_price", 
	            						portfolio: {positions: positions},
	            						date: !date || date == "" ? DateHelper.getCurrentDate() : date,
	            						type: type ? type : "RT"});
         	
         	WSHelper.handleMktRequest(msg, resolve, reject);

	    });
	} else {
		APIError.throwJsonError({message:"Invalid positions: Can't update positions for latest price"});
	}
}

function _computeUpdatedPortfolioForPrice(portfolio, type, date) {
	
	return new Promise(resolve => {
		Promise.all([
			_updatePositionsForPrice(portfolio.detail.positions, type, date),
			
			//Each subposition is sent separately as JULIA portfolio can't handle 
			//redundant securities
			Promise.map(_.get(portfolio,'detail.subPositions', []), function(position) {
				return _updatePositionsForPrice([position], type, date)
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

//Compute Portfolio Analytics
module.exports.computePortfolioAnalytics = function(portfolioId, date) {
	return exports.getPortfolioForDate(portfolioId, {detail:1}, date)
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
				transactions.forEach(item => {item.date = DateHelper.getDate(item.date)});
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
				return _populateStats(portfolio);	
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
module.exports.computeUpdatedPortfolioForPrice = function(portfolio, options, date) {
	
	var priceType = options && options.priceType ? options.priceType : "RT";
	return _computeUpdatedPortfolioForPrice(portfolio, priceType, date)
	.then(latestPricePortfolio => {
		var isAdvice = options && options.advice ? options.advice : false;
		return _populateStats(latestPricePortfolio, isAdvice);
	})
	.then(portfolio => {
		return _populateAdvice(portfolio);
	})
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


            if (!__detail) {
            	__detail = portfolioDetail;
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

module.exports.getUpdatedPortfolioForPrice = function(portfolioId, options, date) {
	let portfolio = null;

	//Wrap the function call inside a promise 
	//Always resolves to valid value (be it null)
	//In case of Julia error, returns stale price portfolio
	//In case of DB error(or unavailability), returns NULL
	return new Promise(resolve => {
		exports.getPortfolioForDate(portfolioId, options, date)
		.then(stalePricePortfolio => {

			portfolio = stalePricePortfolio;
			
			if(portfolio) {
				var nDate = date ? DateHelper.getDate(date) : DateHelper.getCurrentDate();
				
				//If portfolio date is later than today,
				//Update based on latest prices
				if (DateHelper.compareDates(nDate, DateHelper.getCurrentDate()) == 1) {
					nDate = DateHelper.getCurrentDate();	
				} 

				return portfolio.detail ? exports.computeUpdatedPortfolioForPrice(portfolio, options, nDate) :  null;
			} else {
				APIError.throwJsonError({portfolioId: portfolioId, message: `Error getting portfolio for date: ${DateHelper.getCurrentDate()}`});
			}
		})
		.then(latestPortfolio => {
			resolve(latestPortfolio);
		})
		.catch(error => {
			console.log("Error while upadting portfolio for last price");
			console.log(error);

			resolve(portfolio);
		});
	});
};

/*
* Updates portfolio for Everything.
* If it's advice (and owner), it updates te portfolio for average price(and RT price)
* If it's regular portfolio, it updates the portfolio for RT price
* In the end, it updates metrics like nevalue, pnl etc. with latest portfolio
*/
module.exports.getUpdatedPortfolioForEverything = function(portfolioId, options, userId) {
	return Promise.resolve(true)
	.then(() => {
		return options && options.advice ?
			exports.getUpdatedPortfolioWithAveragePrice(portfolioId, options) :
		    exports.getUpdatedPortfolioForPrice(portfolioId, options);
    })
	.then(portfolio => {
		//This fucntion need to be takn out of here but how???
		return _getAdviceStats(portfolio, userId)
		.then(advicePerformance => {
			return Object.assign({advicePerformance: advicePerformance}, portfolio ? portfolio : {});
		});	
	});
};

//Gets the portfolio history till a specific date (Date could be in the history)
module.exports.getPortfolioHistory = function(portfolioId, options, date) {
	
	var __fields = options && options.fields ? options.fields : "";
	__fields = __fields.concat(" detail history");

	var __date = !date || date =="" ? DateHelper.getCurrentDate() : DateHelper.getDate(date);

	let __history = [];
 	
 	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields: __fields})
 	.then(portfolio => {
        if (portfolio) {

            var portfolioDetail = portfolio.detail;
            for(var historicalDetail of portfolio.history) {
                //If Date is greater than the start Date of historical portfolios
                //ADD
                if (DateHelper.compareDates(__date, DateHelper.getDate(historicalDetail.startDate)) != -1) {
                    __history.push(historicalDetail)
                } 
            }

            //If Date is greater than or equal to current portfolio startDate
            if (__history.length == 0 || DateHelper.compareDates(__date, DateHelper.getDate(portfolioDetail.startDate)) != -1) {
                __history.push(portfolioDetail)
            }
            
            var __portfolio = Object.assign({}, portfolio.toObject());

            delete __portfolio.history;
            delete __portfolio.detail;

            return  Object.assign(__portfolio, {history: __history});
        } else {
        	return null;
        }

    });
};

//Get current portfolio with realtime prices
module.exports.getUpdatedPortfolioForEODPrice = function(portfolioId) {
	//Append new fields to some basic fields (ADD SPACE - V. IMP)
	return exports.getUpdatedPortfolioForPrice(portfolioId, {fields: 'detail', priceType:"EOD"});
}

//Validate portfolio
module.exports.validatePortfolio = function(portfolio) {

	return new Promise((resolve, reject) => {
		var msg = JSON.stringify({action:"validate_portfolio", 
            						portfolio: portfolio});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
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
		
	    var msg = JSON.stringify({action:"validate_transactions", 
						transactions: transactions,
						advicePortfolio: advicePortfolio ? advicePortfolio : "",
						investorPortfolio: investorPortfolio ? investorPortfolio : ""});

		WSHelper.handleMktRequest(msg, resolve, reject);

	});
};

//Needs to be be changed for newer setup
module.exports.updatePortfolioForSplitsAndDividends = function(portfolioId) {
	var currentDate = DateHelper.getCurrentDate();

	let isStartDateToday = false

	return exports.getPortfolioForDate(portfolioId, {fields: 'detail'})
	.then(portfolio => {

		var startDate = portfolio.detail.startDate;

		//Adjustment is required is startDate is less than current Date
		//MODIFYING THIS CHECK  to ALLOW when STARTDATE AND CURRENT DATE ARE SAME
		//THIS IS TO MANAGE CONTEST ENTRIES PORTFOLIOS - 31/07/2018
		isStartDateToday = DateHelper.compareDates(DateHelper.getDate(startDate), currentDate) == 0;
		
		var adjustmentRequired = DateHelper.compareDates(DateHelper.getDate(startDate), currentDate) != 1;
		
		if (portfolio && portfolio.detail && adjustmentRequired) {
			return _computeUpdatedPortfolioForSplitsAndDividends(portfolio, DateHelper.getDate(startDate), currentDate);
		} else {
			return [portfolio]
		}
	})
	.then(adjustedPortfolioHistory => { //this object has latest and historical portfolios before adjustment

		if (adjustedPortfolioHistory.length > 1) {
			
			adjustedPortfolioHistory = adjustedPortfolioHistory.map(item => {
				var it = item.detail;
				it.startDate = DateHelper.getDate(it.startDate);
				it.endDate = DateHelper.getDate(it.endDate);
				return it;
			});
			
			var latestPortfolioDetail = adjustedPortfolioHistory.slice(-1)[0];
			var historicalDetail = adjustedPortfolioHistory.slice(0,-1);
			
			return PortfolioModel.updatePortfolio({_id: portfolioId}, {detail: latestPortfolioDetail, history: historicalDetail}, {appendHistory: true});

		} else if (isStartDateToday) {

			var latestPortfolioDetail = adjustedPortfolioHistory.slice(-1)[0];
			return PortfolioModel.updatePortfolio({_id: portfolioId}, {detail: latestPortfolioDetail});
		} else {

			console.log(`No split/dividend adjustment required for ${portfolioId}`);
		}
	});
};

module.exports.getAllPortfoliosForDate = function(date, fields) {
	return PortfolioModel.fetchPortfolios({}, {_id: 1})
	.then(portfolios => {
		return Promise.map(portfolios, function(portfolio) {
			return exports.getPortfolioForDate(portfolio._id, {fields: fields}, date);
		});
	});
}

module.exports.updateAllPortfoliosForSplitsAndDividends = function() {
	return PortfolioModel.fetchPortfolios({}, {_id: 1})
	.then(portfolios => {
		return Promise.mapSeries(portfolios, function(portfolio) {
			return exports.updatePortfolioForSplitsAndDividends(portfolio._id);
		});
	});
};

/*
* Updates the Portfolio's average Price (used mostly to update advice portfolio)
*/
module.exports.getUpdatedPortfolioWithAveragePrice = function(portfolioId, options, date) {
	
	//Wrapping around a promise (always resolves with valid value instead of crashing)
	//If Julia throws an error while computing average price, RETURN portfolio w/o average price
	return new Promise(resolve => {
		//Get portfolio History 
		exports.getPortfolioHistory(portfolioId, {}, date)
		.then(portfolioHistory => {
			let latestPortfolioDetail = portfolioHistory.history.slice(-1)[0];
			let latestStartDate = latestPortfolioDetail.startDate;
			let latestEndDate = latestPortfolioDetail.endDate;

			//Pass portfolio history to Julia to compute the average price
			return _updatePortfolioForAveragePrice(portfolioHistory.history)
			.then(updatedLatestDetail => {
				return {detail: Object.assign({startDate: latestStartDate, endDate: latestEndDate}, updatedLatestDetail)};
			})
		})
		.then(latestAveragePricePortfolio => {
			
			//Now update the portfolio for latest price (RT or EOD)
			return exports.computeUpdatedPortfolioForPrice(latestAveragePricePortfolio, options, date)
			.then(finalLatestDetail => {
				resolve(finalLatestDetail);
			});
		})
		.catch(err => {
			console.log("Error updating portfolio for average price");
			console.log(err);
			//In case of Julia error, backstop by just updating the last price
			//FIX: 14/06/2018
			return exports.getUpdatedPortfolioForPrice(portfolioId, options, date)
			.then(portfolio => {
				resolve(portfolio);
			});
		})
	});
}

/*
* Function to get advice portfolio with populated average price (and latest last price)
*/
module.exports.getAdvicePortfolioWithAvgPrice = function(adviceId, date) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {portfolio:1})
	.then(advice => {  
		if (advice) {
			return exports.getUpdatedPortfolioWithAveragePrice(advice.portfolio, {advice:true}, date)
		} else {
			APIError.throwJsonError({message: "Advice not found"});
		}
	})	
};

/*
* Function to get advice portfolio (uses populateAvg flag to populate average price)
*/
module.exports.getAdvicePortfolio = function(adviceId, options, date) {
	return AdviceModel.fetchAdvice({_id: adviceId}, {portfolio:1})
	.then(advice => {  
		if (advice) {
			return options && options.populateAvg ? 
				exports.getAdvicePortfolioWithAvgPrice(adviceId, date) : 
				exports.getUpdatedPortfolioForPrice(advice.portfolio, {}, date)
		} else {
			APIError.throwJsonError({message: "Advice not found"});
		}
	});
};

module.exports.getAdvicePnlStats = function(adviceId, date) {
	return exports.getAdvicePortfolio(adviceId, date)
	.then(advicePortfolio => {
		if (advicePortfolio && advicePortfolio.pnlStats) {
			return advicePortfolio.pnlStats;
		} else {
			return {};
		}
	});
};

module.exports.savePortfolio = function(port) {
	return PortfolioModel.savePortfolio(port, true);
};

