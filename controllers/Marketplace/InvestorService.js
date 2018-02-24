/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 21:06:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-24 14:15:49
*/

'use strict';
const AdviceModel = require('../../models/Marketplace/Advice');
const InvestorModel = require('../../models/Marketplace/Investor');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require("../helpers");
var ObjectId= require('mongoose').Types.ObjectId;

function _compareIds(x, y) {
	if(!x && !y) {
		return true;
	} else if(!x || !y) {
		return false;
	} else {
		return x.equals(y)
	}
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
		

		return HelperFunctions.computeUpdatedPortfolioForStockTransactions(startPortfolio, transactionsByDay)
		.then(newPortfolio => {
			
			var lastDate = new Date(transactionsByDay[0].date);
			var lastTransactionDate = new Date(transactionsByDay[0].date);

			//Push a portfolio to history
			var lastPortfolio = JSON.parse(JSON.stringify(startPortfolio));
			//Last portfolio's enddate is one day before the transaction day 
			lastDate = new Date(lastDate.setDate(lastDate.getDate() - 1));
			lastPortfolio.endDate = lastDate;

			history.push(lastPortfolio);
				
			//Update the start portfolio
			startPortfolio = newPortfolio;
			startPortfolio.startDate = lastTransactionDate;

			return startPortfolio;
		})
	})
	.then(finalPortfolio => {
		return [finalPortfolio, history];
	});
}

function _updatePortfolioForStockTransactions(portfolio, transactions, action, preview) {
	
	//LOGIC
	//1. Insert new transactions
	//2a. Create portfolio by going over all the transactions 
	//if new transaction dates are older than existing transactions
	//2b. Update current portfolio if the transactions are new

	var updateMethod = 'Create';

	var portfolioId = portfolio._id;

	let firstFunction;
	if(portfolio) {
		if(action == "update") {
			//Check if transaction has "_id" field, 
			//This means MODIFY existing transaction
			//IF YES, then "create" portfolio from scratch
			firstFunction = PortfolioModel.updateTransactions({_id: portfolioId, deleted: false}, transactions);

		} else if(action == "delete") {
			firstFunction = PortfolioModel.deleteTransactions({_id: portfolioId, deleted: false}, transactions);

		} else {
			var oldTransactions = portfolio.transactions ? portfolio.transactions : [];
			var nTransactions = oldTransactions.length;
			if(nTransactions > 0) {
				//sort transaction by date
				oldTransactions.sort((item1, item2) => {
					return item1.date.getTime() < item2.date.getTime() ? -1 : 1; 
				});

				//get the last transaction's date
				var lastDateOld = new Date(oldTransactions[nTransactions -1].date);

				//Also, sort the new transactions by dates
				//First convert to JS dates from string dates
				transactions.sort((item1, item2) => {
					//var d1 = new Date(item1.date).getTime();
					//var d2 = new Date(item2.date).getTime();
					//return d1 < d2 ? -1 : 1; 
					return item1.date < item2.date ? -1 : 1;
				});

				//get first transaction date
				var firstDateNew = transactions[0].date;

				//If earliest date of new transaction is hgher than latest date of old transactions,
				//then APPEND
				if (firstDateNew.getTime() > lastDateOld.getTime()) {
					updateMethod = 'Append';
				} 
			}

			if (!preview) {
				firstFunction = PortfolioModel.addTransactions({_id: portfolioId, deleted: false}, transactions)
			} else {
				updateMethod = "Create";
				
				const np = Object.assign({}, portfolio);
				var originalTransactions = np.transactions ? np.transactions : [];

				firstFunction = {transactions: originalTransactions.concat(transactions), 
						detail: portfolio.detail
					};
			}
		}
	} else {
		APIError.throwJsonError({portfolioId:portfolioId, message: "No Portfolio found"})
	}

	return new Promise(function(resolve, reject) {
		resolve(firstFunction);
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
	.then(([updatedPortfolio, history]) => {
		const updates = {};
		updates.detail = updatedPortfolio;
		updates.history = history;

		if(!preview) {
			return PortfolioModel.updatePortfolio({_id:portfolioId}, updates, updateMethod == "Append");
		} else {
			return updatedPortfolio;
		}
	})
	.catch(err => {
		console.log(err);
		throw err;
	});
}

function _computeUpdatedPortfolioForLatestPrice(portfolio) {
	return Promise.all([
		HelperFunctions.updatePositionsForLatestPrice(portfolio.detail.positions),
		HelperFunctions.updatePositionsForLatestPrice(portfolio.detail.subPositions)
	])
	.then(([updatedPositions, updatedSubPositions]) => {
		
		if(updatedPositions || updatedSubPositions) {
			var updatedPortfolio = JSON.parse(JSON.stringify(portfolio));
			
			if(updatedPositions) {
				updatedPortfolio.detail.positions = updatedPositions;
			}
			
			if(updatedSubPositions) {
				updatedPortfolio.detail.subPositions = updatedSubPositions;
			}

			updatedPortfolio.updatedDate = new Date();
			return [true, updatedPortfolio];
		} else {
			return [false, portfolio];
		}
		
	});
}

function _getUpdatedPortfolio(portfolioId) {
	var fields = 'name detail benchmark updatedDate';
	return PortfolioModel.fetchPortfolio({_id: portfolioId, deleted:false}, {fields: fields})
	.then(portfolio => {
		if(portfolio) {
			var updateRequired = portfolio.updatedDate ? HelperFunctions.getDate(portfolio.updatedDate) < HelperFunctions.getDate(new Date()) : true;
			return updateRequired ? 
				_computeUpdatedPortfolioForLatestPrice(portfolio) :
				[false, portfolio];
		} else {
			APIError.throwJsonError({portfolioId: portfolioId, message: "No portfolio found"});
		}
	})
	.then(([updated, updatedPortfolio]) => {
		return updated ? PortfolioModel.updatePortfolio({_id: portfolioId}, updatedPortfolio) : updatedPortfolio;
	})					
}

//NOT TO BE USED
//Use Stock Transaction instead
//stock transaction has an adviceId fields to be used to mark advice/stock transaction
function _updatePortfolioForAdviceTransactions(portfolioId, adviceId) {
	const updates = {};
	
	return Promise.all([PortfolioModel.fetchPortfolio({_id: portfolioId, deleted:false}, {fields:'detail advices'}),
						AdviceModel.fetchAdvice({_id: adviceId, public: true, deleted: false}, {populate:'portfolio'})])	
	.then(([portfolio, advice]) => {
		if(portfolio && advice.portfolio) {

			if(portfolio.advices.indexOf(adviceId) !=-1) {
				APIError.throwJsonError({adviceId: adviceId, message:"Advice already part of the portfolio"});
			}

			var currentSubPositions = portfolio.detail.subPositions.filter(item => {return _compareIds(item.advice, adviceId);});
			var transactions = [];

			//GO over all the positions in advice portfolio
			// and find out if we need to transact the advice
			// advice could already be present
			advice.portfolio.detail.positions.forEach(position => {
				
				var originalQty = 0;
				if(subPositions){
					var idx = currentSubPositions.indexOf(item => {item.security.equals(position.security)});
				
					if(idx !=-1) {
						currentQty = currentSubPositions[idx].quantity;
					}
				}

				var transaction = {
					security: position.security,
					quantity: position.quantity - currentQty,
					price: 0,
					date: new Date()
				};

				transactions.push(transaction);
			});

			// Send exisitng positions and transactions to Julia
			// Get back updated positions 
			return HelperFunctions.computeUpdatedPortfolioForStockTransactions(portfolio, transactions, adviceId);							
		}
	})
	.then(updatedPortfolio => {
		updates.positions = updatedPortfolio.positions;
		updates.subPositions = updatedPortfolio.subPositions;
		updates.cash = updatedPortfolio.cash;
		updates.advices = adviceId;
		
		return PortfolioModel.updatePortfolio({_id:portfolioId}, updates);
	});	
}

/*
* Create an investor object 
*/
module.exports.createInvestor = function(args, res, next) {
    const userId = args.user._id;

	InvestorModel.fetchInvestor({user:userId}, {fields:'_id', insert:true})
	.then(investor => {
		if(investor) {
			return res.status(200).json(investor);
		} else {
			APIError.throwJsonError({userId: userId, message: "No investor could be created"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

/*
* Get investor summary
* List of portfolios, default portfolio and other relevant fields
* Use detail to get specific fields only
*/
module.exports.getInvestorSummary = function(args, res, next) {
	const investorId = args.investorId.value;
   	
   	const options = {};
    options.fields = 'user defaultPortfolio portfolios followingAdvices subscribedAdvices';
    options.populate = 'defaultPortfolio followingAdvices subscribedAdvices';
    options.insert = true;

    const userId = args.user._id;

    return InvestorModel.fetchInvestor({user: userId, _id: investorId}, options)
    .then(investor => {
    	if(investor) {
    		if(investor.portfolios) {
				return Promise.all([investor, 
						Promise.map(investor.portfolios, function(item) {
							return PortfolioModel.fetchPortfolio({_id: item}, {fields: '_id deleted'});
						})]);
			} else {
				return [investor, []];	
			}
    	} else {
    		APIError.throwJsonError({investorId: investorId, message:"Investor not found or unauthorized"});
    	}
    })
    .then(([investor, portfolios]) => {
    	investor.portfolios = portfolios.filter(item => {return item.deleted == false;});
    	return res.status(200).json(investor);
    })
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

//DETAIL is not really useful
module.exports.getInvestorDetail = function(args, res, next) {
 	const investorId = args.investorId.value;
    const userId = args.user._id;

    const options = {};
    var defaultFields = 'user defaultPortfolio portfolios followingAdvices subscribedAdvices';
    //options.populate = 'defaultPortfolio followingAdvices subscribedAdvices';
    
    options.fields = args.fields.value != "" ? args.fields.value : defaultFields; 
    options.insert = true;
    //options.populate = 'defaultPortfolio followingAdvices subscribedAdvices';
	
    return InvestorModel.fetchInvestor({user: userId, _id:investorId}, options)
   	/*.then(investor => {
   		if(investor) {
   			
   			var updateRequired = false;

   			if(options.fields.indexOf('performance') !=- 1) {
   				//return HelperFunctions.updateInvestorPortfolioPerformance(investor);
   				updateRequired = true;
   			} 

   			return updateRequired ? 
   				HelperFunctions.calculatePerformanceAndUpdateInvestor(investorId, defaultPortfolio) : 
   				InvestorModel.updateInvestorPerformance({_id: investorId}, defaultPortfolio, {performance: {message: "Performance up-to-date"}});
		} else {
			APIError.throwJsonError({investorId: investorId, message:"No Investor Found or not authorized"});
		}
	})
	.then(updated => {
		return InvestorModel.fetchInvestor({user: userId}, options);
	})*/
	.then(investor => {
		if(investor) {
			return res.status(200).json(investor);
		} else {
			APIError.throwJsonError({investorId: investorId, message:"No Investor Found or not authorized"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});  
};

/*
* Get following advices
*/
module.exports.getFollowingAdvices = function(args, res, next) {

	const skip = args.skip.value;
	const limit = args.limit.value;
	const userId = args.user._id;
	const investorId = args.investorId.value;

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'followingAdvices', insert: true})
    .then(investor => {
    	if(investor && investor.followingAdvices) {
    		var following = investor.followingAdvices.filter(item => {return item.active == true;});
    		var count = following.length;
    		following = following.splice(skip, limit);
    		return res.status(200).json({"followingAdvices":following, count: count});	
    	}
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

/*
* Get following advisors
*/
module.exports.getFollowingAdvisors = function(args, res, next) {
	const skip = args.skip.value;
	const limit = args.limit.value;

	const userId = args.user._id;
	const investorId = args.investorId.value;

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'followingAdvisors', insert: true})
    .then(investor => {
    	if(investor.followingAdvisors) {
    		var following = investor.followingAdvisors.filter(item => {return item.active == true;});
    		var count = following.length;
    		following = following.splice(skip, limit);
    		return res.status(200).json({"followingAdvisors": following, count: count});	
    	}
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

/*
* Create Portfolio based on positions in a portfolio
*/
module.exports.OLDcreateInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;

	//Portfolio not linked to any portfolio has (advice = null)
	const portfolio = args.body.value;
	portfolio.detail.positions.forEach(position => {
		position["advice"] = null;
	});

	InvestorModel.fetchInvestor({user: userId}, {})
	.then(investor => {
		if(investor._id.equals(investorId)) {
			return HelperFunctions.validatePortfolio(portfolio);	
		} else {
			APIError.throwJsonError({message: "Not Authorized"});
		}
	})
	.then(valid => {
		if(valid) {
			return PortfolioModel.savePortfolio(portfolio);
		} else {
			APIError.throwJsonError({message: "Invalid Portfolio"});
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return Promise.all([portfolio, InvestorModel.addPortfolio({_id: investorId, user:userId}, portfolio._id)]);
		} else {
			APIError.throwJsonError({message: "Unable to create Portfolio"});
		}
	})
    .then(([portfolio, investor]) => {
    	if(investor && portfolio) {
    		const pf = JSON.parse(JSON.stringify(portfolio));
    		pf["investor"] = investor._id;
    		return res.status(200).json(pf);
		} else {
			APIError.throwJsonError({message: "Could not create portfolio for investor"});
		}
    })
	.catch(err => {
    	return res.status(400).send(err.message);
    });
};

/*
* Create Portfolio based on positions in a portfolio
*/
module.exports.createInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;

	//Portfolio not linked to any portfolio has (advice = null)
	const transactions = args.body.value.transactions;
	const preview = args.body.value.preview;

	//Initialize with empty portfolio
	const portfolio = {
		name: args.body.value.name, 
		benchmark: args.body.value.benchmark,
		detail: {startDate: new Date(), endDate: new Date(), positions: []}
	};

	return InvestorModel.fetchInvestor({user: userId}, {fields:'_id portfolios'})
	.then(investor => {
		if(investor._id.equals(investorId)) {
			return Promise.all([
				Promise.map(investor.portfolios, function(portfolioId) {
					return PortfolioModel.fetchPortfolio({_id:portfolioId}, {fields: 'name deleted'});
				}),
				HelperFunctions.validatePortfolio(portfolio)])	
		} else {
			APIError.throwJsonError({message: "Not Authorized"});
		}
	})
	.then(([otherPortfolios, valid]) => {
		if(valid) {
			

			var numSameNamePortfolios = otherPortfolios.filter(item => {return item.name == portfolio.name && !item.deleted;}).length;
			
			if (numSameNamePortfolios > 0) {
				APIError.throwJsonError({message: "Portfolio exists with same name"});
			}

			return !preview ? PortfolioModel.savePortfolio(portfolio) : portfolio;
		} else {
			APIError.throwJsonError({message: "Invalid Portfolio"});
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return Promise.all([portfolio, !preview ? InvestorModel.addPortfolio({_id: investorId, user:userId}, portfolio._id) : {}]);
		} else {
			APIError.throwJsonError({message: "Unable to create Portfolio"});
		}
	})
    .then(([portfolio, investor]) => {
    	if(investor && portfolio) {
    		//Update the transaction's adviceId to match mongoose requirement
			//This is slightly hacky
			//Need this for PREVIEW feature
			//In case of PREVIEW, input transaction object is not saved 
			//and hence doesn't match the type requirement 
			transactions.forEach(item => {
				item.advice = item.advice != "" ? ObjectId(item.advice) : null;
				item.date = new Date(item.date);
				item._id = item._id != "" ? ObjectId(item._id) : null;
			});

			return transactions.length > 0 ? _updatePortfolioForStockTransactions(portfolio, transactions, "add", preview) : portfolio;
		} else {
			APIError.throwJsonError({message: "Could not create portfolio for investor"});
		}
    })
    .then(portfolio => {
    	if(portfolio) {
			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({messsage: "Can't update portfolio for transactions"});
		}
    })
	.catch(err => {
    	return res.status(400).send(err.message);
    });
};

/*
* Create Portfolio based on stock OR advice transactions
* Fist create an empty portfolio and add transactions subsequently
* Can only accepy one type of transaction currently
* Send two API calls for stock and advice transactions 
*/

//NOT IN USE
module.exports.createInvestorPortfolioFromTransactions = function(args, res, next) {

	const userId = args.user._id;
	const investorId = args.investorId.value;
	const transactions = args.body.value;

	InvestorModel.fetchInvestor({user: userId}, {})
	.then(investor => {
		if(investor._id.equals(investorId)) {
			return PortfolioModel.savePortfolio({});	
		} else {
			APIError.throwJsonError({message: "Not Authorized"});
		}
	})
	.then(emptyPortfolio => {
		if(emptyPortfolio) {
			return Promise.all([emptyPortfolio, InvestorModel.addPortfolio({_id: investorId}, emptyPortfolio._id)]);
		} else {
			APIError.throwJsonError({message: "Unable to create Portfolio"});
		}
	})
	.then(([portfolio, investor]) => {
		if(!investor) {
			APIError.throwJsonError({message: "Error adding portfolio to investor"});
		}

		if(type == "stock" && transactions) {
			return _updatePortfolioForStockTransactions(portfolio._id, transactions);
		} else if (type == "advice" && adviceId) {
			return _updatePortfolioForAdviceTransactions(portfolio._id, adviceId);
		} else {
			APIError.throwJsonError({message: "Invalid transaction type or value"});
		}
	})
    .then(updatedPortfolio => {
    	if(updatedPortfolio) {
    		const pf = JSON.parse(JSON.stringify(updatedPortfolio));
    		pf["investor"] = investorId;
    		return res.status(200).json(pf);
		} else {
			APIError.throwJsonError({message: "Could not create/update portfolio for investor"});
		}
    })
	.catch(err => {
    	return res.status(400).send(err.message);
    });
};

/*
* Search portfolio by ticker
*/
module.exports.getInvestorPortfolios = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;

	let security;
	try {
		const ticker = args.ticker.value;
		const exchange = args.exchange.value;
		const securityType = args.securityType.value;
		const country = args.country.value;

		security = ticker!="" 
					&& exchange!="" 
					&& securityType!="" 
					&& country!=""  ? {ticker: ticker, 
								exchange: exchange, 
								securityType: securityType,
								country: country} : null;
	} catch(err) {
		security = null;
	} 

	//GET STOCK CHART
	//GET all advices of user with stock in it. 
	//GET all portfolios of investors with stock in it

	return InvestorModel.fetchInvestor({user: userId, _id:investorId}, {fields: 'portfolios', insert: true})
	.then(investor => {
		if (investor) {
			if(investor.portfolios) {
				return Promise.map(investor.portfolios, function(item) {
					var fields = 'name detail benchmark';
					/*if(security) {
						fields = fields.concat(' positions');
					}*/
					return PortfolioModel.fetchPortfolio({_id: item, deleted: false}, {fields: fields});
				});
			} else {
				APIError.throwJsonError({userId: userId, message: "No Portfolios found"})
			}
			
		} else {
			APIError.throwJsonError({userId: userId, message: "No Investor found or not authorized"});
		}
	})
	.then(portfolios => {
		if(portfolios) {
			if(security) {
				var portfoliosWithStock = [];
				portfolios.forEach(port => {
					if(port) {
						var idx = port.detail.positions.map(item => item.security).findIndex(item => { var x =
									item.ticker == security.ticker &&
									item.exchange == security.exchange && 
									item.securityType == security.securityType && 
									item.country == security.country; 
									return x;});

						if (idx != -1) {
							portfoliosWithStock.push(port);
						}
					}

				});

				return res.status(200).json(portfoliosWithStock);
			} else {
				return res.status(200).json(portfolios.filter(item => {return item != null;}));
			}
			
		} else {
			APIError.throwJsonError({message: "No portfolios found"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* Fetch investor portfolio detail
*/
module.exports.getInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const portfolioId = args.portfolioId.value;
	const investorId = args.investorId.value;
	
	return InvestorModel.fetchInvestor({user: userId}, {fields: 'user portfolios', insert: true})
	.then(investor => {
		if (investor) {
			if (investor.user.equals(userId)){
				if(investor.portfolios) {
					if (investor.portfolios.map(item => item.toString()).indexOf(portfolioId) != -1) {
						return _getUpdatedPortfolio(portfolioId);
					} else {
						APIError.throwJsonError({userId: userId, portfolioId: portfolioId, message: "Not a valid portfolio for investor"})
					}
				} else {
					APIError.throwJsonError({userId: userId, message: "No Portfolios found"})
				}
			} else {
				APIError.throwJsonError({userId: userId, message: "Not Authorized to view"})
			}
			
		} else {
			APIError.throwJsonError({userId: userId, message: "No Investor found"});
		}
	})
	.then(updatedPortfolio => {
		if(updatedPortfolio) {
			return res.status(200).send(updatedPortfolio);
		} else {
			APIError.throwJsonError({message: "Invalid updated portfolio"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* UPDATE portfolio  
*/
module.exports.updateInvestorPortfolio = function(args, res, next) {
	
	const userId = args.user._id;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	const portfolio = args.body.value;

	//FILTER OUT items that CAN'T be updated
	//If not, it can potentially modify the detail as well and we don't want that
	delete portfolio.detail;

 	return InvestorModel.fetchInvestor({user: userId}, {fields:'portfolios'}) 
	.then(investor => {
		if(investor && investor.portfolios && investor._id.equals(investorId)) {
			
			if(investor.portfolios.indexOf(portfolioId) != -1) {			
				return InvestorModel.updatePortfolio({_id:portfolioId}, portfolio);
			} else {
				APIError.throwJsonError({portfolioId:portfolioId, message: "Portfolio not found"})
			}
		} else {
			APIError.throwJsonError({investorId:investorId, message: "Investor or Portfolios not found"})
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({messsage: "Can't update portfolio for transactions"});
		}	
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* UPDATE portfolio based on stock OR stock/advice transactions
*/
module.exports.updateInvestorPortfolioForTransactions = function(args, res, next) {
	
	const userId = args.user._id;
	const transactions = args.body.value.transactions;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;
	const action = args.body.value.action;
	const preview = args.body.value.preview;

	//Update the transaction's adviceId to match mongoose requirement
	//This is slightly hacky
	//Need this for PREVIEW feature
	//In case of PREVIEW, input transaction object is not saved 
	//and hence doesn't match the type requirement 
	transactions.forEach(item => {
		item.advice = item.advice != "" ? ObjectId(item.advice) : null;
		item.date = new Date(item.date);
		item._id = item._id != "" ? ObjectId(item._id) : null;
	});

 	return Promise.all([
 		InvestorModel.fetchInvestor({user: userId}, {fields:'portfolios'}),
 		PortfolioModel.fetchPortfolio({_id: portfolioId, deleted:false}, {fields:'detail transactions'}) 
	])
	.then(([investor, portfolio]) => {
		if(investor && portfolio && investor.portfolios && investor._id.equals(investorId)) {
			
			if(investor.portfolios.indexOf(portfolioId) != -1) {			
				if(transactions) {
					return _updatePortfolioForStockTransactions(portfolio, transactions, action, preview);
				}  else {
					APIError.throwJsonError({message: "Invalid transactions"});
				}
			} else {
				APIError.throwJsonError({portfolioId:portfolioId, message: "Portfolio not found"})
			}
		} else {
			APIError.throwJsonError({investorId:investorId, message: "Investor or Portfolios not found"})
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({messsage: "Can't update portfolio for transactions"});
		}	
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* Get detail about ticker specific info about portfolio
* like positions, subpositions, transactions
*/
module.exports.getInvestorPortfolioPosition = function(args, res, next) {
	const userId = args.user._id;
	const portfolioId = args.portfolioId.value;

	const ticker = ags.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const security = {ticker: ticker, 
						exchange: exchange, 
						securityType: securityType,
						country: country};
	//GET STOCK CHART
	//GET all advices of user with stock in it. 
	//GET all portfolios of investors with stock in it

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'portfolios', insert:true})
	.then(investor => {
		if (investor) {
			if(investor.portfolios){
				var idx = investor.portfolios.indexOf(portfolioId);
				if(idx !=-1) {
					return PortfolioModel.fetchPortfolio({_id: portfolioId, deleted: false},{fields: 'detail transactions'});
				}
			} else {
				APIError.throwJsonError({portfolioId: portfolioId, message:"Portfolio not found"});
			}
		} else {
			APIError.throwJsonError({userId: userId, message: "No Investor found"});
		}
	})
	.then(portfolio => {
		if(portfolio) {
			var	positionDetail = {
				_id: portfolio._id,
				name: portfolio.name,
				position: portfolio.detail.positions.filter(item => {return item.security.equals(security);}),
				subPositions: portfolio.detail.subPositions.filter(item => {return item.security.equals(security);}),
				transactions: portfolio.transactions.filter(item => {return item.security.equals(security);})
			};

			return res.status(200).json(positionDetail);
		} else {
			APIError.throwJsonError({userId:userId, portfolioId:portfolioId, message: "No portfolio found"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* Soft delete investor portfolio
* Sets delete flag on portfolio
*/
module.exports.deleteInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	return InvestorModel.fetchInvestor({user: userId}, {fields:'portfolios defaultPortfolio'})
	.then(investor => {

		return Promise.all([investor, Promise.map(investor.portfolios, function(item) {
			return PortfolioModel.fetchPortfolio({_id:item}, {fields:'_id deleted'})
		})]);
	})
	.then(([investor, populatedPortfolios]) => {
		if(investor && investor._id.equals(investorId)) {
			//WHEN to convert to string
			//CONFUSION
			var idx = populatedPortfolios.map(item => item._id.toString()).indexOf(portfolioId.toString())
			if(idx != -1) {	

				//Remove the deleted portfolio
				populatedPortfolios.splice(idx, 1);
				var validPortfolios = populatedPortfolios.filter(item => {return item.deleted == false;});

				var defaultPortfolio = investor.defaultPortfolio;
				
				var defaultId = !defaultPortfolio || defaultPortfolio.equals(portfolioId) ? 
					validPortfolios.length > 0 ? validPortfolios[0] : null : defaultPortfolio;

				return Promise.all([PortfolioModel.updatePortfolio({_id: portfolioId}, {deleted: true, updatedDate: new Date()}),
					InvestorModel.updateInvestor({_id:investorId}, {defaultPortfolio: defaultId})]); 
			} else {
				APIError.throwJsonError({portfolioId: portfolioId, message: "No portfolio found "});
			}
		} else {
			APIError.throwJsonError({investorId: investorId, message: "Not a valid investor or not authorized"});
		}
	})
	.then(([portfolio, investor]) => {
		if(portfolio) {
			return res.status(200).send({investorId: investorId, portfolioId: portfolioId, message:"Successfully deleted"});
		} else {
			APIError.throwJsonError({investorId: investorId, portfolioId: portfolioId, message: "Error deleting the portfolio"})
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};
