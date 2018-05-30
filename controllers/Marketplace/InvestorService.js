/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 21:06:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-05-24 19:44:50
*/

'use strict';
const config = require('config');
const InvestorModel = require('../../models/Marketplace/Investor');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const AdviceModel = require('../../models/Marketplace/Advice');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require("../helpers");
const AdviceHelper = require("../helpers/Advice");
const PortfolioHelper = require("../helpers/Portfolio");
const PerformanceHelper = require("../helpers/Performance");
var ObjectId = require('mongoose').Types.ObjectId;
const DateHelper = require('../../utils/Date');

function _compareIds(x, y) {
	if(!x && !y) {
		return true;
	} else if(!x || !y) {
		return false;
	} else {
		return x.equals(y)
	}
}

/*
* Create an investor object 
*/
module.exports.createInvestor = function(args, res, next) {
    const userId = args.user._id;

	return InvestorModel.fetchInvestor({user:userId}, {fields:'_id', insert:true})
	.then(investor => {
		if(investor) {
			return res.status(200).json(investor);
		} else {
			APIError.throwJsonError({userId: userId, message: "Internal error creating investor", errorCode: 1308});
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
	const subscribedAdvicesLimit = config.get('max_subscription_per_investor');
   	const options = {};
    options.fields = 'user defaultPortfolio profile';
	options.insert = true;
	const adviceQuery = {deleted: false, subscribers:{'$elemMatch':{investor: investorId, active:true}}}; 

    const userId = args.user._id;

    return InvestorModel.fetchInvestor({user: userId}, options)
    .then(investor => {
    	if(investor && investor._id && investor._id.equals(investorId)) {
			return Promise.all([
				investor, 
				investor.defaultPortfolio ? PortfolioHelper.getUpdatedPortfolioForEverything(investor.defaultPortfolio, {fields:'name detail benchmark'}).catch(err => {return null;}) : null,
				investor.defaultPortfolio ? PerformanceHelper.getAllPerformance(investor.defaultPortfolio).catch(err => {return {error: err.message};}) : null,
				AdviceModel.fetchAdvices(adviceQuery, {})
			]);
    	} else {
    		APIError.throwJsonError({investorId: investorId, message:"Investor not found/not authorized", errorCode: 1302});
    	}
    })
    .then(([investor, updatedDefaultPortfolio, updatedDefaultPerformance, advicesResult]) => {	
    	return res.status(200).send(Object.assign({
			subscriptionLimitExceeded: advicesResult[1] >= subscribedAdvicesLimit,
			defaultPortfolio: updatedDefaultPortfolio, 
			defaultPerformance: updatedDefaultPerformance
		},investor.toObject()));
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
    
    options.fields = args.fields.value != "" ? args.fields.value : defaultFields; 
    options.insert = true;
	
    return InvestorModel.fetchInvestor({user: userId}, options)
	.then(investor => {
		if(investor && investor._id && investor._id.equals(investorId)) {
			return res.status(200).json(investor);
		} else {
			APIError.throwJsonError({investorId: investorId, message:"Investor not found/not authorized", errorCode: 1302});
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
		detail: {startDate: DateHelper.getDate("1900-01-01"), endDate: DateHelper.getDate("2200-01-01"), positions: []}
	};


	var setDefault = args.body.value.setdefault;

	if (portfolio.name == "" && !preview) {
		return res.status(400).send({message:"Portfolio name can't be empty", errorCode: 1403});
	}

	transactions.forEach(item => {
		item.advice = item.advice != "" && item.advice ? ObjectId(item.advice) : null;
		item.date = DateHelper.getDate(item.date);
		item._id = item._id != "" ? ObjectId(item._id) : null;
	});

	let portfolioId;

	return InvestorModel.fetchInvestor({user: userId}, {fields:'_id portfolios'})
	.then(investor => {
		if (investor){
			if(investor._id.equals(investorId)) {
				return Promise.all([
					!preview ? Promise.map(investor.portfolios, function(portfolioId) {
						return PortfolioModel.fetchPortfolio({_id:portfolioId}, {fields: 'name deleted'});
					}):[],
					PortfolioHelper.validatePortfolio(portfolio),
					PortfolioHelper.validateTransactions(transactions)])	
			} else {
				APIError.throwJsonError({message: "Investor not authorized to add transactions", errorCode: 1303});
			}
		} else {
			APIError.throwJsonError({message: "Investor not found", errorCode: 1301})
		}
	})
	.then(([otherPortfolios, validPortfolio, validTransactions]) => {
		if(validPortfolio && validTransactions) {
			
			var numSameNamePortfolios = otherPortfolios.filter(item => {return item ? item.name == portfolio.name && !item.deleted : false}).length;
			
			if (numSameNamePortfolios > 0) {
				APIError.throwJsonError({message: "Portfolio exists with same name"});
			}

			return !preview ? PortfolioModel.savePortfolio(portfolio) : portfolio;
		} else if (!validPortfolio) {
			APIError.throwJsonError({message: "Invalid Portfolio Composition", errorCode: 1406});
		} else if (!validTransactions) {
			APIError.throwJsonError({message: "Invalid transactions", errorCode: 1407});
		}
	})
	.then(portfolio => {
		if(portfolio) {
			portfolioId = portfolio._id;
			return Promise.all([portfolio, !preview ? InvestorModel.addPortfolio({_id: investorId, user:userId}, portfolio._id, setDefault) : {}]);
		} else {
			APIError.throwJsonError({message: "Internal error creating portfolio", errorCode: 1405});
		}
	})
    .then(([portfolio, investor]) => {
    	if(investor && portfolio) {
    		//Update the transaction's adviceId to match mongoose requirement
			//This is slightly hacky
			//Need this for PREVIEW feature
			//In case of PREVIEW, input transaction object is not saved 
			//and hence doesn't match the type requirement 
			return transactions.length > 0 ? 
				PortfolioHelper.updatePortfolioForStockTransactions(portfolio, transactions, "add", preview) : 
				portfolio;
		} else {
			APIError.throwJsonError({message: "Internal error adding portfolio", errorCode: 1309});
		}
    })
    .then(portfolio => {

    	if(portfolio) {
			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({messsage: "Internal error updating portfolio for stock transactions", errorCode: 1407});
		}
    })
	.catch(err => {
		return Promise.all([
			portfolioId ? InvestorModel.removePortfolio({_id: investorId}, portfolioId) : null, 
			portfolioId ? PortfolioModel.deletePortfolio({_id:portfolioId}) : null
		]) 
		.then(([investor, portfolio])=> {
			return res.status(400).send(err.message);
		});
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

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'portfolios defaultPortfolio', insert: true})
	.then(investor => {
		if (investor && investor._id && investor._id.equals(investorId)) {
			if(investor.portfolios) {
				return Promise.map(investor.portfolios, function(item) {
					var fields = '_id name benchmark createdDate updatedDate';
					return Promise.all([
						//THIS IS BUGGY....WHY??
						item ? PortfolioHelper.getUpdatedPortfolioForEverything(item, {fields: fields}) : {message:"Portfolio not valid"},
						item ? PerformanceHelper.getPerformanceSummary(item) : null		
					])
					.then(([portfolio, performanceSummary]) => {
						return portfolio ? Object.assign({performance: performanceSummary, isDefaultPortfolio: investor.defaultPortfolio.equals(portfolio._id)}, portfolio) : null;
					});
				});
			} else {
				APIError.throwJsonError({userId: userId, message: "No Portfolios found", errorCode: 1402})
			}
			
		} else {
			APIError.throwJsonError({userId: userId, message: "No Investor found/not authorized", errorCode: 1302});
		}
	})
	.then(portfolios => {
		if(portfolios) {
			if(security) {
				var portfoliosWithStock = [];
				portfolios.forEach(port => {
					if(port && port.detail && port.detail.positions) {
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
			APIError.throwJsonError({message: "No portfolios found", errorCode: 1402});
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
	var fields = args.fields.value;

	if (fields == '' || !fields) {
		fields = 'name benchmark detail updatedDate';
	}

	let isDefaultPortfolio;
	
	return InvestorModel.fetchInvestor({user: userId}, {fields: 'user portfolios defaultPortfolio', insert: true})
	.then(investor => {
		if (investor) {
			if (investor._id.equals(investorId)){
				if(investor.portfolios) {
					if (investor.portfolios.map(item => item.toString()).indexOf(portfolioId) != -1) {
						isDefaultPortfolio = investor.defaultPortfolio ? investor.defaultPortfolio.toString() ==  portfolioId : false;
						return PortfolioHelper.getUpdatedPortfolioForEverything(portfolioId, {fields: fields}, userId);
					} else {
						APIError.throwJsonError({userId: userId, portfolioId: portfolioId, message: "Not a valid portfolio for investor"})
					}
				} else {
					APIError.throwJsonError({userId: userId, message: "No Portfolios found", errorCode: 1402})
				}
			} else {
				APIError.throwJsonError({userId: userId, message: "Investor not authorized to view", errorCode: 1304})
			}
			
		} else {
			APIError.throwJsonError({userId: userId, message: "Investor not found", errorCode: 1301});
		}
	})
	.then(updatedPortfolio => {
		if (updatedPortfolio) {
			return res.status(200).send(Object.assign(updatedPortfolio, {isDefaultPortfolio: isDefaultPortfolio}));
		} else {
			APIError.throwJsonError({message: "Portfolio not found", errorCode: 1401});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* UPDATE portfolio  --- IS THIS IN USE???
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
			APIError.throwJsonError({investorId:investorId, message: "Investor not found", errorCode: 1301})
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({messsage: "Inernal error updating portfolio", errorCode: 1308});
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
					return PortfolioHelper.updatePortfolioForStockTransactions(portfolio.toObject(), transactions, action, preview);
				}  else {
					APIError.throwJsonError({message: "Invalid transactions", errorCode: 1406});
				}
			} else {
				APIError.throwJsonError({portfolioId:portfolioId, message: "Portfolio not found", errorCode: 1401})
			}
		} else if(!investor) {
			APIError.throwJsonError({investor:investorId, message: "Investor not found", errorCode: 1301})
		} else if(!portfolio){
			APIError.throwJsonError({portfolio: portfolioId, message: "No portfolios found", errorCode: 1402})
		} else if(!investor.portfolios){
			APIError.throwJsonError({message: "No investor porfolios found", errorCode: 1305})
		} else if(investor._id.equals(investorId)) {
			APIError.throwJsonError({message: "Investor not authorized to add transactions", errorCode: 1303});
		}
	})
	.then(portfolio => {
		if(portfolio) {
			
			//Async call to compute Performance for portfolio
			PerformanceHelper.computeAllPerformance(portfolioId);

			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({messsage: "Internal error updating portfolio for stock transactions", errorCode: 1407});
		}	
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

/*
* Get detail about ticker specific info about portfolio
* like positions, subPositions, transactions
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
				APIError.throwJsonError({investor: investorId, message:"No investor porfolios found", errorCode: 1305});
			}
		} else {
			APIError.throwJsonError({userId: userId, message: "Investor not found", errorCode: 1301});
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
			APIError.throwJsonError({portfolio:portfolioId, message: "Portfolio not found", errorCode: 1401});
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

	return InvestorModel.fetchInvestor({user: userId}, {fields:'_id portfolios defaultPortfolio'})
	.then(investor => {
		if(investor && investor.portfolios && investor._id.equals(investorId)) {
			return Promise.all([
				investor, 
				Promise.map(investor.portfolios, function(item) {
					return PortfolioModel.fetchPortfolio({_id:item}, {fields:'_id deleted'})
				})
			]);
		} else if(!investor){
			APIError.throwJsonError({message: "Investor not found", errorCode: 1301});
		} else if(!investor.portfolios) {
			APIError.throwJsonError({message: "No investor porfolios found", errorCode: 1305});
		}
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

				return Promise.all([PortfolioModel.updatePortfolio({_id: portfolioId}, {deleted: true, updatedDate: new Date()}, {fields: 'deleted'}),
					InvestorModel.updateInvestor({_id:investorId}, {defaultPortfolio: defaultId})]); 
			} else {
				APIError.throwJsonError({portfolio: portfolioId, message: "Portfolio not found", errorCode: 1401});
			}
		} else {
			APIError.throwJsonError({investorId: investorId, message: "Investor not found/not authorized", errorCode: 1302});
		}
	})
	.then(([portfolio, investor]) => {
		if(portfolio && portfolio.deleted) {
			return res.status(200).send({investorId: investorId, portfolioId: portfolioId, message:"Successfully deleted"});
		} else {
			APIError.throwJsonError({investorId: investorId, portfolioId: portfolioId, message: "Internl error deleting the portfolio", errorCode: 1409})
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

module.exports.updateInvestorDefaultPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	return InvestorModel.fetchInvestor({user: userId}, {fields:'portfolios'})
	.then(investor => {
		if (investor && investor.portfolios && investor.portfolios.indexOf(portfolioId) !=- 1 && investor._id.equals(investorId)) {
			return PortfolioModel.fetchPortfolio({_id:portfolioId}, {fields:'_id deleted'});
		} else if(!investor) {
			APIError.throwJsonError({message: "Investor not found", errorCode: 1301});
		} else if(investor.portfolios) {
			APIError.throwJsonError({message: "No investor porfolios found", errorCode: 1305});
		} else {
			APIError.throwJsonError({investor: investorId, portfolio: portfolioId, message: "Investor not authorized to update portfolio", errorCode: 1306});
		}
	})
	.then(portfolio => {
		if(portfolio && !portfolio.deleted) {
			return InvestorModel.updateInvestor({_id: investorId}, {defaultPortfolio: portfolioId});
		} else {
			APIError.throwJsonError({message: "Portfolio not found", portfolio: portfolioId, errorCode: 1401});
		}
	})
	.then(updatedInvestor => {
		return res.status(200).send({message: "Default portfolio updated successfully"});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};
