/*
* @Author: Shiv Chawla
* @Date:   2018-03-02 11:39:25
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-15 17:45:31
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

function _updatePortfolioWeights(port) {
	var portfolio = Object.assign({}, port);
	var totalVal = portfolio.detail.cash;
	var positions = portfolio.detail.positions;

	positions.forEach(item => {
	 	totalVal += item.quantity*item.lastPrice;
	});

	positions.map(item => {
		var weight = totalVal > 0.0 ? (item.quantity*item.lastPrice)/totalVal : 0.0;
		item.weightInPortfolio = weight;
		return item;
	});

	return portfolio;
}

function _updatePortfolioForSplitsAndDividends(portfolio, date) {
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
        								date: date}); 

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
		return Promise.all([
			_computeUpdatedPortfolioForPrice({detail:updatedPortfolioForTransactions}), 
			history
		]);
	})
	.then(([[priceUpdated, updatedPortfolio], history]) => {
		if(!preview) {
			const updates = {};
			updates.detail = updatedPortfolio.detail;
			updates.history = history;

			return PortfolioModel.updatePortfolio({_id:portfolioId}, updates, {new: true, fields:'name detail benchmark updatedDate', updateHistory: updateMethod == "Append"})
			.then(updatedPortfolio => {
				return _updatePortfolioWeights(updatedPortfolio.toObject());
			});
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
				return _updatePortfolioWeights(updatedPortfolio);
			})
		}
	});
};

//Update portfolio for prices for any date
module.exports.computeUpdatedPortfolioForPrice = function(portfolio, date) {
	
	return _computeUpdatedPortfolioForPrice(portfolio, date)
	.then(([updated, latestPricePortfolio]) => {
		return _updatePortfolioWeights(latestPricePortfolio);
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

            delete __portfolio.history;
            delete __portfolio.detail;

            return  Object.assign(__portfolio, {detail: __detail ? __detail.toObject() : null});

        } else {
        	APIError.throwJsonError({portfolioId: portfolioId, message: "Portfolio not found", errorCode: 1401});	
        }

    })
	.then(portfolio => {
		if(portfolio) {
			return portfolio.detail ? _computeUpdatedPortfolioForPrice(portfolio, __date) : [false, null];
		} else {
			APIError.throwJsonError({portfolioId: portfolioId, message: `Error getting portfolio for date: ${__date}`});
		}
	})
	.then(([updated, latestPricePortfolio]) => {
		return latestPricePortfolio ? _updatePortfolioWeights(latestPricePortfolio) : null;
	})
	.then(latestWeightPortfolio => {
		//Populate ADVICE NAME in sub-positions
		
		if (latestWeightPortfolio) {
			var subPositions = latestWeightPortfolio.detail.subPositions;
			
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
				latestWeightPortfolio.detail.subPositions = updatedSubPositions;
				return latestWeightPortfolio;
			})
		} else {
			return null;
		}
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
        }

    });
};

//Get current portfolio with realtime prices
module.exports.getUpdatedPortfolioForRtPrices = function(portfolioId) {
	//Append new fields to some basic fields (ADD SPACE - V. IMP)
	return exports.getPortfolioForDate(portfolioId)
	.then(portfolio => {
		if(portfolio) {
			return _computeUpdatedPortfolioForPrice(portfolio, null, "RT");
		} else {
			APIError.throwJsonError({portfolioId: portfolioId, message: "Portfolio not found", errorCode: 1401});
		}
	})
	.then(([updated, latestPricePortfolio]) => {
		return latestPricePortfolio;
	});
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

//THIS WILL MOSTLY WORK BUT ADVICES with FUTURE PORTFOLIOS CAN BREAK
module.exports.updatePortfolioForSplitsAndDividends = function(portfolioId) {
	var currentDate = DateHelper.getCurrentDate();

	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields: 'detail adjustmentHistory'})
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
		return updated && updatedDetail ? PortfolioModel.updatePortfolio({_id: portfolioId}, {detail: updatedDetail, adjustmentHistory: currentDate}, {updateHistory: true}) : null;
	});
};


//Gets all portfolios for current date (used in Jobs)
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

