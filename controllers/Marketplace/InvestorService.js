/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 21:06:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-06 14:27:37
*/

'use strict';
const InvestorModel = require('../../models/Marketplace/Investor');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require("../helpers");
const PortfolioHelper = require("../helpers/Portfolio");
const PerformanceHelper = require("../helpers/Performance");
var ObjectId = require('mongoose').Types.ObjectId;

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
    options.populate = 'followingAdvices subscribedAdvices';
    options.insert = true;

    const userId = args.user._id;

    return InvestorModel.fetchInvestor({user: userId, _id: investorId}, options)
    .then(investor => {
    	if(investor) {
    		if(investor.portfolios) {
				return Promise.all([investor, 
						Promise.map(investor.portfolios, function(item) {
							return PortfolioModel.fetchPortfolio({_id: item}, {fields: '_id name deleted'});
						}),
						investor.defaultPortfolio ? PortfolioHelper.getUpdatedPortfolio(investor.defaultPortfolio, 'name detail benchmark') : null]);
			} else {
				return [investor, []];	
			}
    	} else {
    		APIError.throwJsonError({investorId: investorId, message:"Investor not found or unauthorized"});
    	}
    })
    .then(([investor, portfolios, updatedDefaultPortfolio]) => {
    	//Added check on item for NULL values - 27/02/2018
    	investor.portfolios = portfolios.filter(item => {return item ? !item.deleted : false;});
    	investor.subscribedAdvices = investor.subscribedAdvices.filter(item => {return item ? item.active && !item.advice.deleted : false; });
    	investor.followingAdvices = investor.followingAdvices.filter(item => {return item ? item.active && !item.advice.deleted : false;});

    	investor.defaultPortfolio = updatedDefaultPortfolio;
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

	if (portfolio.name == "" && !preview) {
		return res.status(400).send({message:"Portfolio name can't be empty"});
	}

	transactions.forEach(item => {
		item.advice = item.advice != "" ? ObjectId(item.advice) : null;
		item.date = new Date(item.date);
		item._id = item._id != "" ? ObjectId(item._id) : null;
	});


	return InvestorModel.fetchInvestor({user: userId}, {fields:'_id portfolios'})
	.then(investor => {
		if(investor._id.equals(investorId)) {
			return Promise.all([
				!preview ? Promise.map(investor.portfolios, function(portfolioId) {
					return PortfolioModel.fetchPortfolio({_id:portfolioId}, {fields: 'name deleted'});
				}):[],
				HelperFunctions.validatePortfolio(portfolio),
				HelperFunctions.validateTransactions(transactions)])	
		} else {
			APIError.throwJsonError({message: "Not Authorized"});
		}
	})
	.then(([otherPortfolios, validPortfolio, validTransactions]) => {
		
		if(validPortfolio && validTransactions) {
			
			var numSameNamePortfolios = otherPortfolios.filter(item => {return item ? item.name == portfolio.name && !item.deleted : false}).length;
			
			if (numSameNamePortfolios > 0) {
				APIError.throwJsonError({message: "Portfolio exists with same name"});
			}

			return !preview ? PortfolioModel.savePortfolio(portfolio) : portfolio;
		} else {
			APIError.throwJsonError({message: "Invalid Portfolio or transactions"});
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
			return transactions.length > 0 ? PortfolioHelper.updatePortfolioForStockTransactions(portfolio, transactions, "add", preview) : portfolio;
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
					var fields = 'name benchmark createdDate updatedDate';
					return Promise.all([
						item ? PortfolioModel.fetchPortfolio({_id: item, deleted: false}, {fields: fields}) : {message:"Portfolio not valid"},
						item ? PerformanceHelper.getPerformanceSummary(item) : null		
					])
					.then(([portfolio, performanceSummary]) => {
						return portfolio ? Object.assign({performance: performanceSummary}, portfolio.toObject()) : null;
					
					});
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
	var fields = args.fields.value;

	if (fields == '' || !fields) {
		fields = 'name benchmark detail updatedDate';
	}
	
	return InvestorModel.fetchInvestor({user: userId}, {fields: 'user portfolios', insert: true})
	.then(investor => {
		if (investor) {
			if (investor.user.equals(userId)){
				if(investor.portfolios) {
					if (investor.portfolios.map(item => item.toString()).indexOf(portfolioId) != -1) {
						return PortfolioHelper.getUpdatedPortfolio(portfolioId, fields);
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
					return PortfolioHelper.updatePortfolioForStockTransactions(portfolio.toObject(), transactions, action, preview);
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

				return Promise.all([PortfolioModel.updatePortfolio({_id: portfolioId}, {deleted: true, updatedDate: new Date()}, {fields: 'deleted'}),
					InvestorModel.updateInvestor({_id:investorId}, {defaultPortfolio: defaultId})]); 
			} else {
				APIError.throwJsonError({portfolioId: portfolioId, message: "No portfolio found "});
			}
		} else {
			APIError.throwJsonError({investorId: investorId, message: "Not a valid investor or not authorized"});
		}
	})
	.then(([portfolio, investor]) => {
		if(portfolio && portfolio.deleted) {
			return res.status(200).send({investorId: investorId, portfolioId: portfolioId, message:"Successfully deleted"});
		} else {
			APIError.throwJsonError({investorId: investorId, portfolioId: portfolioId, message: "Error deleting the portfolio"})
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
		if (investor.portfolios.indexOf(portfolioId) !=- 1) {
			return PortfolioModel.fetchPortfolio({_id:portfolioId}, {fields:'_id deleted'})
			.then(portfolio => {
				if(portfolio && !portfolio.deleted) {
					return InvestorModel.updateInvestor({_id: investorId}, {defaultPortfolio: portfolioId});
				} else {
					APIError.throwJsonError({message: "Portfolio doesn't exist or deleted", portfolio: portfolioId});
				}
			})
		} else {
			APIError.throwJsonError({investor: investorId, portfolio: portfolioId, message: "Not authorized to change. Not the owner of the portfolio"});
		}
	})
	.then(updated => {
		return res.status(200).send({message: "Default portfolio updated successfully"});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};