/*
* @Author: Shiv Chawla
* @Date:   2017-05-09 13:41:52
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-24 15:32:27
*/

'use strict';

const PortfolioModel = require('../models/Marketplace/Portfolio');
const Promise = require('bluebird');
const config = require('config');
const WebSocket = require('ws');
const APIError = require('../utils/error');
const HelperFunctions = require("./helpers");

/*function _hasPortfolioDetailChanged(oldPortfolioDetail, newPortfolioDetail) {
	return HelperFunctions.comparePortfolioDetail(oldPortfolio, newPortfolio);
}

function _hasPortfolioBenchmarkChanged(oldPortfolioBenchmark, newPortfolioBenchmark) {
	return HelperFunctions.compareSecurity(oldPortfolio, newPortfolio);
}

function _hasPortfolioChanged(oldPortfolio, newPortfolio) {
	return Promise.all([_hasPortfolioBenchmarkChanged(oldPortfolio.benchmark, newPortfolio.benchmark),
			_hasPortfolioDetailChanged(oldPortfolio.detail, newPortfolio.detail)]);
}

module.exports.updatePortfolio = function(portfolioId, newPortfolio, oldPortfolio, addNew) {
	return addNew ? _hasPortfolioChanged(oldPortfolio, newPortfolio) : [true, false]
	.then(([benchmarkChanged, detailChanged]) => {
		return PortfolioModel.updatePortfolio({_id: portfolioId}, newPortfolio), addNew)
		return detailChanged ?  
			: benchmarkChanged ? PortfolioModel.updatePortfolio({_id: portfolioId}, newPortfolio) : oldPortfolio;
		
	})				  
}*

Promise.all([_hasPortfolioBenchmarkChanged(currentAdvice.portfolio.benchmark, newAdvice.portfolio.benchmark),
					  _hasPortfolioDetailChanged(currentAdvice.portfolio.detail, newAdvice.portfolio.detail),
					  advice.public == true ? HelperFunctions.validateAdvice({advice: newAdvice, oldAdvice:currentAdvice}) : HelperFunctions.validateAdvice({advice: newAdvice})]);

/*module.exports.createPortfolio = function(args, res, next) {
	const userId = args.user._id;

	//Only investor can create a portfolio
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			return InvestorModel.getInvestor({_id: investorId}, {fields:'currentPortfolio'})
		} else {
			throw new Error({userId: userId, message:"User not found"});
			//return res.status(400).json();
		}
	})
	.then(investor => {
		if(!investor.currentPortfolio.portfolio) {

			const portfolio = {
		        advisor: investorId,
		       	currentPortfolio: {
		       		startDate: args.body.value.startDate,
		       		endDate: args.body.value.endDate,
		       		portfolio: args.body.value.portfolio
	       		},
	       		benchmark: args.body.value.benchmark,
		       	createdDate: new Date(),
		       	updatedDate: new Date(),

		    };

			return _validateAndSavePortfolio(advice);
		} else {
			throw new Error({investorId: investorId, message:"Cannot add more advices", errorCode: 5});
			//return res.status(400).json();
		}

	})
    .then(advice => {
    	console.log(advice);
    	console.log("here already");
    	if(advice) {
			return InvestorModel.addAdvice({
        		_id: investorId
			}, advice._id);
		} else {
			throw new Error({message: "Invalid Portfolio"});
			//return res.status(400).json();
		}
    })
    .then(advice => {
    	return res.status(200).json(advice);
    })
	.catch(err => {
    	return res.status(400).json(err);
    	//next(err);
    });
};

module.exports.updatePortfolio = function(args, res, next) {
	const portfolioId = args.portfolioId.value;
	const investorId = args.investorId.value;

	const userId = args.user._id;

	const updates = args.body.value;
	updates.updatedDate = new Date();

	//Only author/advisor can update the advice
	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			if(user.investor == investorId ) {
				return InvestorModel.getInvestor({_id: investorId}, {fields:'portfolio'})

			} else {
				throw new Error({invetorId: investorId, message:"Not Authorized", errorCode: 1});
				//return res.status(400).json();
			}
		} else {
			throw new Error({userId: userId, message:"User not found"});
			//return res.status(400).json();
		}
	})
	.then(investor => {
		if(investor.portfolio) {
			var portfolioId = investor.portfolio._id;
			return _updatePortfolio(portfolioId, updates);
		} else {
			throw new Error({investorId:investorId, message:"No Portfolio found"});
		}

		//return res.status(400).json();
	})
	.then(portfolio => {
		if(portfolio) {
			return res.status(200).json(portfolio);
		}
	})
    .catch(err => {
    	return res.status(400).json(err);
    	//next(err);
    });
};

module.exports.getPortfolio = function(args, res, next) {

	const portfolioId = args.portfolioId.value;
	const userId = args.user._id;

    UserModel.fetchUser({_id:userId})
    .then(user => {
    	if(user) {
			return InvestorModel.getInvestor({_id: user.investor}, {fields:'portfolio'});
		} else {
			APIError.thowJsonError({userId: userId, message:"User not found"});

		}
	})
	.then(portfolios => {
		if(portfolios) {
			if (portfolios.indexOf(portfolioId) != -1) {
				return PortfolioModel.getPortfolio({_id: portfolioId});
			} else {
				APIError.thowJsonError({userId: userId, portfolioIdmessage:"Not Authorized"});
			}
		}
	})
  	.catch(err => {
    	return res.status(400).json(err);
    	//next(err);
    });
};

module.exports.getPositionDetail = function(args, res, next) {
	const userId = args.user._id;
	const portfolioId = args.portfolioId.value;
	const positionSymbol = args.symbol.value;
};

module.exports.getPortfolioStockTransactions = function(args, res, next) {
	const portfolioId = args.portfolioId;
	const userId = args.user._id;
	const investorId = args.user.investor;

	UserModel.fetchUser({_id:userId})
	.then(user => {
		if(user) {
			return InvestorModel.getInvestor({_id: investorId}, 'portfolio');
		} else {
			APIError.thowJsonError({message: "User not found"})
		}
	})
	.then(portfolios => {
		if(portfolios) {
			if(portfolio.indexOf(portfolioId) != -1) {

			} else {
				APIError.thowJsonError({userId: userId, portfolioId:portfolioId, message: "Not Authorized to view"});
			}
		} else {
			APIError.thowJsonError({userId: userId, message: "No portfolios found"});
		}
	})
};*/
