/*
* @Author: Shiv Chawla
* @Date:   2018-01-23 19:00:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-13 14:23:14
*/

'use strict'
const InvestorModel = require('../../models/Marketplace/Investor');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const AdviceModel = require('../../models/Marketplace/Advice');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const HelperFunctions = require("../helpers");

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

function _computePortfolioConstituentsPerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var startDate = new Date(currentPortfolio.startDate);
		var endDate = new Date();


		return HelperFunctions.computeConstituentPerformance(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computePortfolioComposition(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var startDate = new Date(currentPortfolio.startDate);
		var endDate = new Date();


		return HelperFunctions.computePortfolioComposition(currentPortfolio, startDate, endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computeSimulatedPerformance(portfolioId) {
	
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var startDate = new Date(currentPortfolio.startDate);
		startDate = new Date(startDate.setDate(startDate.getDate() - 365));

		var portfolioHistory = [{startDate: startDate, 
									endDate: currentPortfolio.startDate,
									portfolio: {
										positions: currentPortfolio.positions,
										cash: currentPortfolio.cash}
									}];

		return HelperFunctions.computePerformance(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computePerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark history'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var portfolioHistory = [{startDate: currentPortfolio.startDate, 
									endDate: new Date(),//currentPortfolio.endDate,
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

function _computeAndUpdateLatestPerformance(portfolioId) {
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
						return Promise.all([
						_computePortfolioComposition(portfolioId),	
						_computePortfolioConstituentsPerformance(portfolioId),
						_computeAndUpdateLatestPerformance(portfolioId)]);
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
	.then(([portfolioComposition, constituentPerformance, updatedPerformance]) => {
		return res.status(200).json({stockPerformance: constituentPerformance, portfolioPerformance: updatedPerformance, portfolioComposition: portfolioComposition});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

module.exports.getPerformanceAdvicePortfolio = function(args, res, next) {
		
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	return Promise.all([AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'advisor portfolio public subscribers'}),
			AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
			InvestorModel.fetchInvestor({user:userId}, {fields:'_id', insert: true})])
	.then(([advice, advisor, investor]) => {
		if (advice && advisor) {

			const advisorId = advisor._id;
			var activeSubscribers = advice.subscribers.filter(item => {return item.active == true}).map(item => item.investor.toString());
			const investorId = investor._id.toString();

			var showMoreDetail = advice.advisor.equals(advisorId) || activeSubscribers.indexOf(investorId) != -1;
			if (advice.advisor.equals(advisorId) || advice.public == true) {
				return Promise.all([
					showMoreDetail ? _computePortfolioComposition(advice.portfolio) : null,
					showMoreDetail ? _computePortfolioConstituentsPerformance(advice.portfolio) : null,
				 	_computeSimulatedPerformance(advice.portfolio), 
				 	_computeAndUpdateLatestPerformance(advice.portfolio)]);
			} else {
				APIError.throwJsonError({userId: userId, message:"Not Authorized"});
			}
		} else {
			APIError.throwJsonError({userId: userId, message: "No Advice/Advisor found"});
		}
	})
	.then(([portfolioComposition, constituentPerformance, simulatedPerformance, updatedPerformance]) => {
		return res.status(200).send({advicePerformance: updatedPerformance, historicalPerformance: simulatedPerformance, stockPerformance: constituentPerformance, adviceComposition: portfolioComposition});
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
			return Promise.all([
				HelperFunctions.computePortfolioComposition(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				HelperFunctions.computeConstituentPerformance(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'}),
				HelperFunctions.computeHistoricalPerformance(portfolio.detail, portfolio.detail.startDate, portfolio.detail.endDate)])
		} else if(!validPortfolio) {
			//this should not be called but in any-case
			APIError.thowJsonError({message: "Invalid portfolio composition"});
		} 
	})
	.then(([portfolioComposition, constituentPerformance, portfolioPerformance]) => {
		return res.status(200).json({stockPerformance: constituentPerformance, portfolioPerformance: portfolioPerformance, portfolioComposition: portfolioComposition});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};
