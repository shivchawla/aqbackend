/*
* @Author: Shiv Chawla
* @Date:   2017-02-28 21:06:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-07-03 17:45:56
*/

'use strict';
const AdviceModel = require('../models/Advice');
const InvestorModel = require('../models/Investor');
const UserModel = require('../models/user');
const PortfolioModel = require('../models/Portfolio');
const APIError = require('../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require("./helpers");


function _checkPerformanceUpdateRequired(performanceArray, portfolioId) {
	var update = false;
	
	if(!portfolioId) {
		return false;
	}

	if(performanceArray) {
        var performanceFilteredArray = performanceArray.filter(item => {return item.portfolio.valueOf() == portfolioId;});
		console.log("lallluuu");
        console.log(performanceFilteredArray);
        
        if(performanceFilteredArray.length > 1) {
        	return false;
        }

        if(performanceFilteredArray.length == 0) {
        	console.log("Rajuuu0");
        	return true;
        }

        var performance = performanceArray[0].value;

        if(performance && performance.updatedDate) {
            if(getDate(performance.updatedDate) < getDate(new Date())) {
            	update = true;
            }
        } else {
        	console.log("Rajuuu1");
        	update = true; 
        } 

    } else {
    	console.log("Rajuuu2");
        update = true;
    }

    console.log("update");
    console.log(update);
    return update;
}

function getDate(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getYear();

    return d+"-"+m+"-"+y;  
}

exports.createInvestor = function(args, res, next) {
    const userId = args.user._id;

	InvestorModel.fetchInvestor({user:userId}, {fields:'_id'})
	.then(investor => {
		if(!investor) {
			return InvestorModel.saveInvestor({user:userId}, {user:userId});
		} else {
			APIError.throwJsonError({userId:userId, msg:"Investor is already present"});
		}
	})
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

exports.getInvestorSummary = function(args, res, next) {
	const investorId = args.investorId.value;
   	
   	const options = {};
    options.fields = 'user defaultPortfolio performance followingAdvices subscribedAdvices';

    const userId = args.user._id;

    InvestorModel.fetchInvestor({user: userId, _id: investorId}, options)
   	.then(investor => {
   		if(investor) {
			var update = false;
 			if(options.fields.indexOf('performance')) {
	            //check if advice Performance is the latest
	            update = _checkPerformanceUpdateRequired(investor.performance, investor.defaultPortfolio);
	        }

	        if(update) {
	             return Promise.all([true, HelperFunctions.calculatePerformanceAndUpdateInvestor(investorId, defaultPortfolio)]);
			} else {
				return [false, investor];
			}
   			
		} else {
			APIError.throwJsonError({investorId: investorId, message:"No Investor Found"});
		}
	})
	.then(([updated, investor])=>{
		if(updated){
			return InvestorModel.fetchInvestor({user: userId, _id: investorId}, options);
		} else {
			return investor;
		}
	})
	.then(updatedInvestor => {
		return res.status(200).json(updatedInvestor);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

exports.getInvestorDetail = function(args, res, next) {
 	const investorId = args.investorId.value;
    const userId = args.user._id;

    const options = {};
    options.fields = args.fields.value;
    
    InvestorModel.fetchInvestor({user: userId, _id: investorId}, options)
   	.then(investor => {
   		if(investor) {
   			return res.status(200).json(investor);
   			/*if(options.fields.indexOf('performance') !=- 1) {
   				return HelperFunctions.updateInvestorPortfolioPerformance(investor);
   			} else {
				return res.status(200).json(investor);
			}*/
		} else {
			APIError.throwJsonError({investorId: investorId, message:"No Investor Found or not authorized"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});  
};

exports.getFollowingAdvices = function(args, res, next) {

	const skip = args.skip.value;
	const limit = args.limit.value;
	const userId = args.user._id;
	const investorId = args.investorId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, 'followingAdvices')
    .then(investor => {
    	if(investor && investor.followingAdvices) {
    		var following = investor.followingAdvices;
    		var count = following.count();
    		following = following.splice(skip, limit);
    		return res.status(200).json({"followingAdvices":following, count: count});	
    	}
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

exports.getFollowingAdvisors = function(args, res, next) {
	const skip = args.skip.value;
	const limit = args.limit.value;

	const userId = args.user._id;
	const investorId = args.investorId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, 'followingAdvisors')
    .then(investor => {
    	if(investor.followingAdvisors) {
    		var following = investor.followingAdvisors;
    		var count = following.count();
    		following = following.splice(skip, limit);
    		return res.status(200).json({"followingAdvisors":following, count: count});	
    	}
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

exports.createInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;

	//Portfolio not linked to any portfolio has (advice = null)
	const portfolio = args.body.value;
	portfolio.positions.forEach(position => {
		position["advice"] = null;
	});

	HelperFunctions.validatePortfolio(portfolio)
	.then(valid => {
		if(valid) {
			return PortfolioModel.savePortfolio(portfolio);
		} else {
			APIError.throwJsonError({msg: "Invalid Portfolio"});
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return InvestorModel.addPortfolio({_id: investorId, user:userId}, portfolio._id);
		} else {
			APIError.throwJsonError({msg: "Unable to create Portfolio"});
		}
	})
    .then(investor => {
    	return res.status(200).json(investor);
    })
	.catch(err => {
    	return res.status(400).send(err.message);
    });
};

exports.getInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, {fields:'portfolios performance'})
   	.then(investor => {
   		if(investor) {
   			if(investor.portfolios) {
	   			if(investor.portfolios.indexOf(portfolioId) != -1) { 
	   				return PortfolioModel.fetchPortfolio({_id: portfolioId, deleted: false},{});
	   			} else {
	   				APIError.throwJsonError({portfolioId: portfolioId, message: "Not present or authorized"});
	   			}
	   		} else {
	   			APIError.throwJsonError({investorId: investorId, message: "Not portfolios present"});
	   		}
   		}
   	})
   	.then(portfolio => {
   		return res.status(200).json(portfolio);
   	})
   	.catch(err => {
   		return res.status(400).send(err.message);
   	});
};

exports.getInvestorPerformance = function(args, res, next) {
	const userId = args.user._id;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, {fields:'performance'})
   	.then(investor => {
   		if(investor) {
   			var update = _checkPerformanceUpdateRequired(investor.performance, portfolioId);
   		
	        if(update) {
	             return Promise.all([true, HelperFunctions.calculatePerformanceAndUpdateInvestor(investorId, portfolioId)]);
			} else {
				return [false, investor];
			}
		}

   	})
   	.then(([updated, investor]) => {
   		if(updated) {
   			return InvestorModel.fetchInvestor({user: userId, _id: investorId}, {fields:'performance'});
   		} else {
   			return investor;
   		}
   	})
   	.then(investor => {
   		if(investor) {
   			console.log(investor);
   			return investor.performance.filter(item => {return item.portfolio.valueOf() == portfolioId;});
   		}
   	})
   	.then(performance => {
   		return res.status(200).json(performance);
   	})
   	.catch(err => {
   		return res.status(400).send(err.message);
   	});
};

exports.getInvestorPortfoliosWithStock = function(args, res, next) {
	const userId = args.user._id;

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

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'portfolios'})
	.then(investor => {
		if (investor) {
			if(investor.portfolios){
				return Promise.all(investor.portfolios.forEach(portfolio => {
					return PortfolioModel.fetchPortfolio({_id: portfolio._id});
				}))
			}
		} else {
			APIError.throwJsonError({userId: userId, msg: "No Investor found"});
		}
	})
	.then(([portfolios])=> {
		if(portfolios) {
			
			var portfolioWithStock = [];
			portfolios.forEach(port => {
				var idx = port.positions.map(item => item.security).indexOf(security);
				
				if (idx != -1) {
					portfolioWithStock.push({
							_id: port._id,
							name: port.name,
							position: port.positions[idx]
						});
				}

			});

			return res.status(200).json(portfolioWithStock);
		} else {
			APIError.throwJsonError({msg: "No portfolios with stock"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

exports.updateInvestorPortfolioForStock = function(args, res, next) {
	const userId = args.user._id;
	const transactions = args.body.value;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, {fields:'portfolios'})
	.then(investor => {

		if(investor && investor.portfolios) {
			
			if(investor.portfolios.indexOf(portfolioId) != -1) {
				return HelperFunctions.updatePortfolioForStockTransactions({_id: portfolioId}, transactions);
			} else {
				APIError.throwJsonError({portfolioId:portfolioId, msg: "Portfolio not found"})
			}
		} else {
			APIError.throwJsonError({investorId:investorId, msg: "Investor or Portfolios not found"})
		}
	})
	.then(portfolio => {
		if(portfolio) {
			console.log("Here first");
			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({msg: "Can't update portfolio for transactions"});
		}	
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

// Common function to transact advice or stock
exports.updateInvestorPortfolio = function(args, res, next) {
	const userId = args.user._id;
	const transactions = args.body.value;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	const type = args.type.value;
	const adviceId = args.adviceId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, {fields:'portfolios'})
	.then(investor => {

		if(investor && investor.portfolios) {
			
			if(investor.portfolios.indexOf(portfolioId) != -1) {
				
				if(type == "stock" && transactions) {
					return HelperFunctions.updatePortfolioForStockTransactions({_id: portfolioId}, transactions);
				} else if (type == "advice" && adviceId) {
					return HelperFunctions.updatePortfolioForAdviceTransactions({_id: portfolioId}, adviceId);	
				} else {
					APIError.throwJsonError({msg: "Invalid transaction type or value"});
				}
			} else {
				APIError.throwJsonError({portfolioId:portfolioId, msg: "Portfolio not found"})
			}
		} else {
			APIError.throwJsonError({investorId:investorId, msg: "Investor or Portfolios not found"})
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return res.status(200).json(portfolio); 
		} else {
			APIError.throwJsonError({msg: "Can't update portfolio for transactions"});
		}	
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

//TO FIX THE  LOGIC
exports.updateInvestorPortfolioForAdvice = function(args, res, next) {
	const userId = args.user._id;
	const adviceId = args.adviceId.value;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, {fields:'portfolios'})
	.then(investor => {
		if(investor && investor.portfolios) {
			if(investor.portfolios.indexOf(portfolioId) != -1) {
				return HelperFunctions.updatePortfolioForAdviceTransactions({_id: portfolioId}, adviceId);	
			} else {
				APIError.throwJsonError({portfolioId:portfolioId, msg: "Portfolio not found"})
			}
		} else {
			APIError.throwJsonError({investorId:investorId, msg: "Investor or Portfolios not found"})
		}
	})
	.then(portfolio => {
		if(portfolio) {
			return res.status(200).json(portfolio);
		}
	})
	.catch(err => {
		return res.status(200).send(err.message);
	})	
};

exports.getInvestorPortfolioPosition = function(args, res, next) {
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

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'portfolios'})
	.then(investor => {
		if (investor) {
			if(investor.portfolios){
				var idx = investor.portfolios.indexOf(portfolioId);
				if(idx !=-1) {
					return PortfolioModel.fetchPortfolio({_id: portfolioId},{});
				}
			} else {
				APIError.throwJsonError({portfolioId: portfolioId, msg:"Portfolio not found"});
			}
		} else {
			APIError.throwJsonError({userId: userId, msg: "No Investor found"});
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
			APIError.throwJsonError({userId:userId, portfolioId:portfolioId, msg: "No portfolio found"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

exports.deleteInvestorPortfolio = function(args, res, next){
	const userId = args.user._id;
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;

	InvestorModel.fetchInvestor({user: userId, _id: investorId}, {fields:'portfolios'})
	.then(investor => {
		console.log(investor);
		if(investor && investor.portfolios) {
			if(investor.portfolios.indexOf(portfolioId) != -1) {	
				return Promise.all([PortfolioModel.updatePortfolio({_id: portfolioId}, {deleted: true, updatedDate: new Date()}),
							InvestorModel.removePortfolio({_id: investorId}, portfolioId)])
			} else {
				APIError.throwJsonError({portfolioId: portfolioId, message: "No portfolio found "});
			}
		}
	})
	.then(([portfolio, investor]) => {
		if(portfolio && investor) {
			return res.status(200).send({investorId: investorId, portfolioId: portfolioId, msg:"Successfully deleted"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};
