/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 21:06:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-25 13:17:44
*/

'use strict';
const AdviceModel = require('../models/Marketplace/Advice');
const InvestorModel = require('../models/Marketplace/Investor');
const UserModel = require('../models/user');
const PortfolioModel = require('../models/Marketplace/Portfolio');
const PerformanceModel = require('../models/Marketplace/Performance');
const APIError = require('../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require("./helpers");

function getDate(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getYear();

    return d+"-"+m+"-"+y;  
}

//MOVED ALL TO PERFORMANCE SERVICE
/*function _checkPerformanceUpdateRequired(performanceArray, portfolioId) {
	var update = false;
	
	if(!portfolioId) {
		return false;
	}

	if(performanceArray) {
        var performanceFilteredArray = performanceArray.filter(item => {return item.portfolio.valueOf() == portfolioId;});

        if(performanceFilteredArray.length == 0) {
        	return true;
        }

        var performance = performanceArray[0].value;

        if(!performance.portfolioStats) {
        	return true;
        }

        if(performance && performance.updatedDate) {
            if(getDate(performance.updatedDate) < getDate(new Date())) {
            	update = true;
            }
        } else {
        	update = true; 
        } 

    } else {
        update = true;
    }

    return update;
}

function _computePerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'current benchmark history'})
	.then(portfolio => {
		var currentPortfolio = portfolio.current;

		var portfolioHistory = [{startDate: currentPortfolio.startDate, 
									endDate: currentPortfolio.endDate,
									portfolio: {
										positions: currentPortfolio.positions,
										cash: currentPortfolio.cash}
									}];

		if(portfolio.history) {							
			portfolio.history.forEach(port => {
				portfolioHistory.push({startDate: port.startDate, 
										endDate: port.endDate,
										portfolio: port.detail});
			});
		}

		return HelperFunctions.computePerformance(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computeAndUpdatePerformance(portfolioId) {
	
	return PerformanceModel.fetchPerformance({portfolio: portfolioId})
	.then(performance => {
		var updateRequired = !performance;

		if (performance) {
			updateRequired = performance.lastUpdated ? performance.lastUpdated.getDate() < new Date().getDate() ? true : false : true;
		} 

		return updateRequired ? _computePerformance(portfolioId) : performance;		
	})
	.then(performance => {

		console.log(performance);

		if(performance) {
			performance.portfolioValues = performance.portfolioValues.map(item => { 
				  //Changing time to unix timestamp
				  item.date = new Date(item.date).getTime()/1000; 
				  return item;
			});	
			
			performance["updateMessage"] = "Updated successfully";
		} else {
			performance["updateMessage"] = "Couldn't updated performance";
		}

		performance["updatedDate"] = new Date();

		console.log(performance);

		return PerformanceModel.updatePerformance({portfolio: portfolioId}, performance);
	});
}

function _updateInvestorPerformance(investorId, portfolioId, performance) {
	return InvestorModel.updateInvestorPerformance({_id: investorId}, portfolioId, performance); 
}*/

function _updatePortfolioForStockTransactions(portfolioId, transactions) {
	const updates = {};
	
	return PortfolioModel.fetchPortfolio({_id: portfolioId, deleted: false}, {fields: 'positions subPositions cash'})
	.then(portfolio => {
		if(portfolio) {
			// Send exisitng positions and transactions to Julia
			// Get back updated positions 
			return HelperFunctions.updatePortfolio(portfolio, transactions, null);
							
		} else {
			APIError.throwJsonError({portfolioId: portfolioId, message: "Portfolio not found"});
		}
	})
	.then(updatedPortfolio => {
		updates.positions = updatedPortfolio.positions;
		updates.subPositions = updatedPortfolio.subPositions;
		updates.cash = updatedPortfolio.cash;
		updates.transactions = transactions;
		return PortfolioModel.updatePortfolio({_id: portfolioId}, updates);
	})
}

function _updatePortfolioForAdviceTransactions(portfolioId, adviceId) {
	const updates = {};
	
	return Promise.all([PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'positions subPositions cash advices'}),
						AdviceModel.fetchAdvice({_id: adviceId}, {fields:'portfolio'})])	
	.then(([portfolio, advice]) => {
		if(portfolio && advice.portfolio) {

			if(portfolio.advices.indexOf(adviceId) !=-1) {
				APIError.throwJsonError({adviceId: adviceId, message:"Advice already part of the portfolio"});
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
			return HelperFunctions.updatePortfolio(portfolio, transactions, adviceId);							
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
    		return res.status(200).json(investor);
    	} else {
    		APIError.throwJsonError({investorId: investorId, message:"Investor not found or unauthorized"});
    	}
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

module.exports.createInvestorPortfolio = function(args, res, next) {
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
				return Promise.all(investor.portfolios.map(item => {
					var fields = 'name detail benchmark';
					/*if(security) {
						fields = fields.concat(' positions');
					}*/
					return PortfolioModel.fetchPortfolio({_id: item}, {fields: fields});
				}));
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
						var fields = 'name detail history advices benchmark';
						return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields: fields});
					} else {
						APIError.throwJsonError({userId: userId, message: "PortfolioId is not a valid portfolio for investor"})
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
	.then(portfolio => {
		if(portfolio) {
			return res.status(200).json(portfolio);
			//return Promise.all([portfolio, _computeAndUpdatePerformance(portfolioId)]);
		} else {
			APIError.throwJsonError({message: "No portfolios found"});
		}
	})
	/*.then(([portfolio, performance]) => {
		if (portfolio && performance) {
			return res.status(200).json({portfolio: portfolio, performance: performance});
		} else {
			//shouldn't happen
			APIError.throwJsonError({message: "Portfolio not found or Error computing performance"});	
		}
	})*/
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

// Common function to transact advice or stock
module.exports.updateInvestorPortfolio = function(args, res, next) {
	
	const userId = args.user._id;
	const transactions = args.body ? args.body.value : null;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	const type = args.type.value;
	const adviceId = args.adviceId ? args.adviceId.value : null;

 	return InvestorModel.fetchInvestor({user: userId}, {fields:'portfolios'}) 
	.then(investor => {
		if(investor && investor.portfolios && investor._id.equals(investorId)) {
			
			if(investor.portfolios.indexOf(portfolioId) != -1) {			
				if(type == "stock" && transactions) {
					return _updatePortfolioForStockTransactions(portfolioId, transactions);
				} else if (type == "advice" && adviceId) {
					return _updatePortfolioForAdviceTransactions(portfolioId, adviceId);	
				} else {
					APIError.throwJsonError({message: "Invalid transaction type or value"});
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
					return PortfolioModel.fetchPortfolio({_id: portfolioId},{});
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
				_id: port._id,
				name: port.name,
				position: port.positions.filter(item =>{return item.security.equals(security);}),
				subPositions: port.subPositions.filter(item => {return item.security.equals(security);}),
				transactions: port.transactions.filter(item => {return item.security.equals(security);})
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

module.exports.deleteInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	return InvestorModel.fetchInvestor({user: userId}, {fields:'portfolios'})
	.then(investor => {
		if(investor && investor.portfolios && investor._id.equals(investorId)) {
			if(investor.portfolios.indexOf(portfolioId) != -1) {	
				return Promise.all([PortfolioModel.updatePortfolio({_id: portfolioId}, {deleted: true, updatedDate: new Date()}),
							InvestorModel.removePortfolio({_id: investorId}, portfolioId)])
			} else {
				APIError.throwJsonError({portfolioId: portfolioId, message: "No portfolio found "});
			}
		} else {
			APIError.throwJsonError({investorId: investorId, message: "Not a valid investor or not authorized"});
		}
	})
	.then(([portfolio, investor]) => {
		if(portfolio && investor) {
			return res.status(200).send({investorId: investorId, portfolioId: portfolioId, message:"Successfully deleted"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};
