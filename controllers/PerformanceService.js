/*
* @Author: Shiv Chawla
* @Date:   2018-01-23 19:00:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-25 13:19:32
*/

'use strict'
const InvestorModel = require('../models/Marketplace/Investor');
const AdvisorModel = require('../models/Marketplace/Advisor');
const AdviceModel = require('../models/Marketplace/Advice');
const PortfolioModel = require('../models/Marketplace/Portfolio');
const PerformanceModel = require('../models/Marketplace/Performance');
const APIError = require('../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require("./helpers");

function _checkPerformanceUpdateRequired(performance) {
	if(!performance) {
		return true;
	}

	if(performance && performance.updatedDate) {
        if(getDate(performance.updatedDate) < getDate(new Date())) {
        	 return true;
        }
    } else {
    	return true; 
    } 

	if(!performance.portfolioValues) {
		return true;
	}

	var portfolioValues = performance.portfolioValues;
    if(portfolioValues.length == 0) {
    	return true;
    }
        
    return false;
}

function _computePerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark history'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

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
										portfolio: {
											positions: port.positions,
											cash: port.cash
										}
									});
			});
		}

		return HelperFunctions.computePerformance(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _getLatestPerformance(portfolioId) {
	return PerformanceModel.fetchPerformance({portfolio: portfolioId})
	.then(performance => {
		var updateRequired = _checkPerformanceUpdateRequired(performance);
		return updateRequired ? Promise.all([true, _computePerformance(portfolioId)]) : [false, performance];
	})
	.then(([updated, latestPerformance]) => {
		if(latestPerformance && updated) {
			/*latestPerformance.portfolioValues = latestPerformance.portfolioValues.map(item => { 
				  //Changing time to unix timestamp
				  item.date = new Date(item.date).getTime()/1000; 
				  return item;
			});*/	
			
			latestPerformance["updateMessage"] = "Updated successfully";
		} else {
			latestPerformance["updateMessage"] = "Performance up-to-date";
		}

		latestPerformance["updatedDate"] = new Date();
		return PerformanceModel.updatePerformance({portfolio: portfolioId}, latestPerformance);
	});
}

module.exports.getPerformanceInvestorPortfolio = function(args, res, next) {
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;
	const userId = args.user._id;

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'user portfolios', insert: true})
	.then(investor => {
		if (investor) {
			if (investor.user.equals(userId)){
				if(investor.portfolios) {
					if (investor.portfolios.map(item => item.toString()).indexOf(portfolioId) != -1) {
						//var fields = 'name current history advices benchmark';
						//return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields: fields});
						//return PerformanceModel.fetchPerformance({portfolio: portfolioId})
						return _getLatestPerformance(portfolioId);
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
	.then(updatedPerformance => {
		return res.status(200).send(updatedPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

module.exports.getPerformanceAdvicePortfolio = function(args, res, next) {
		
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	return Promise.all([AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'advisor portfolio public'}),
			AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'})])
	.then(([advice, advisor]) => {
		if (advice && advisor) {
			if (advisor._id.equals(advice.advisor) || advice.public == true) {
				return _getLatestPerformance(advice.portfolio);
			} else {
				APIError.throwJsonError({userId: userId, message:"Not Authorized"});
			}
		} else {
			APIError.throwJsonError({userId: userId, message: "No Advice/Advisor found"});
		}
	})
	.then(updatedPerformance => {
		return res.status(200).send(updatedPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

module.exports.getPerformanceNewPortfolio = function(args, res, next) {
	const portfolio = args.body.value;

	return HelperFunctions.validatePortfolio(portfolio)
	.then(validPortfolio => {	
		if (validPortfolio) { 
			return HelperFunctions.computeHistoricalPerformance(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate);
		} else if(!validPortfolio) {
			//this should not be called but in any-case
			APIError.thowJsonError({message: "Invalid portfolio composition"});
		} 
	})
	.then(performance => {
		return res.status(200).send(performance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};
