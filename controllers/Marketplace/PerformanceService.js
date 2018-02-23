/*
* @Author: Shiv Chawla
* @Date:   2018-01-23 19:00:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-23 16:41:46
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

function _checkPerformanceUpdateRequired(performanceDetail) {
	if(!performanceDetail) {
		return true;
	}


	if(performanceDetail && performanceDetail.updatedDate) {
        if(HelperFunctions.getDate(performanceDetail.updatedDate) < HelperFunctions.getDate(new Date())) {
        	 return true;
        }
    } else {
    	return true; 
    } 

	
	var performanceDetailMetrics = performanceDetail.metrics ? performanceDetail.metrics : [];
    if(performanceDetailMetrics.length == 0) {
    	return true;
    }
        
    return false;
}

function _computePortfolioConstituentsPerformance(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var startDate = HelperFunctions.getDate(currentPortfolio.startDate);
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

function _computeTruePerformance(portfolioId) {
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
				portfolioHistory.push({startDate: port.startDate ? port.startDate : port.endDate, 
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

function _computeSimulatedPerformanceCurrentPortfolio(portfolioId) {
	return PortfolioModel.fetchPortfolio({_id: portfolioId}, {fields:'detail benchmark'})
	.then(portfolio => {
		var currentPortfolio = portfolio.detail;

		var startDate = new Date(); //new Date(currentPortfolio.startDate);
		startDate = new Date(startDate.setDate(startDate.getDate() - 365));

		var portfolioHistory = [{startDate: startDate, 
									endDate: new Date(), 
									portfolio: {
										positions: currentPortfolio.positions,
										cash: currentPortfolio.cash}
									}];

		return HelperFunctions.computePerformance(portfolioHistory, portfolio.benchmark ? portfolio.benchmark : {ticker: 'NIFTY_50'});
	});
}

function _computeSimulatedPerformance(portfolioId) {
	
	return _computeSimulatedPerformanceCurrentPortfolio(portfolioId)
	.then(simulatedPerformance => {
		
		if (simulatedPerformance) {
			var updates = {updateMessage: "Updated Successfully",
				updateDate: new Date(),
				metrics: {
					date:  HelperFunctions.getDate(new Date(simulatedPerformance.date)),
					portfolioComposition: null,
					portfolioPerformance: simulatedPerformance.value,
					constituentPerformance: null,
				},

				portfolioValues: simulatedPerformance.portfolioValues
			};

			return updates;
		} else {
			return null;
		}
		//return PerformanceModel.updatePerformanceByType({portfolio: portfolioId}, updates, "simulated");
	})
	.catch(err => {
		console.log("Warn: " + err.message);
		return null;
	});
}

function _computeLatestPerformance(portfolioId) {
	return PerformanceModel.fetchPerformance({portfolio: portfolioId}, {fields: 'current'})
	.then(performance => {
		var updateRequired = _checkPerformanceUpdateRequired(performance ? performance.current : null);
		return updateRequired ? Promise.all([
				true, 
				_computeTruePerformance(portfolioId), //WORKS
				//null,
				//null
				_computePortfolioComposition(portfolioId), //WORKS
				//null,
				_computePortfolioConstituentsPerformance(portfolioId)
				]) : [false, performance];
	})
	.then(([updated, latestPerformance, portfolioComposition, constituentPerformance]) => {
		
		var latestPerformanceDate = new Date(latestPerformance.date);
      	var portfolioCompositionDate = new Date(portfolioComposition.date);
      	var constituentPerformanceDate = new Date(constituentPerformance.date);

		var updateMessage = updated ? "Updated successfully" : "Performance up-to-date";

      	if (latestPerformanceDate.getTime() == portfolioCompositionDate.getTime()
      		&& latestPerformanceDate.getTime() == constituentPerformanceDate.getTime()) {
      		
      		var updates = {updateMessage: updateMessage, 
				updateDate: new Date(),
				metrics: {
					date:  HelperFunctions.getDate(latestPerformanceDate),
					portfolioComposition: portfolioComposition.value,
					portfolioPerformance: latestPerformance.value,
					constituentPerformance: constituentPerformance.value
				},

				portfolioValues: latestPerformance.portfolioValues
			};

			return updates;
      	} else {
      		console.log("Warn: Output date mismatch while calculating performance");
      		return null;
      	}
	})
	.catch(err => {
		console.log("Warn: " + err.message);
		return null;
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
					if (investor.portfolios.filter(item => !item.deleted).map(item => item.toString()).indexOf(portfolioId) != -1) {
						return _computeLatestPerformance(portfolioId);
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
	.then(latestPerformance => {
		if (latestPerformance) {
			return PerformanceModel.updatePerformanceByType({portfolio: portfolioId}, latestPerformance, "current");
		} else {
			//If latest Performance is NULL, send the alraeady stored performance
			//Keep a track of cases where computation yields NULL performance
			return PerformanceModel.fetchPerformance({portfolio: portfolioId});
		}
	})	
	.then(updatedPerformance => {
		if (updatedPerformance) {
			return res.status(200).send(updatedPerformance);
		} else {
			APIError.throwJsonError({message: "Invalid performance"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

module.exports.getPerformanceAdvicePortfolio = function(args, res, next) {
		
	const adviceId = args.adviceId.value;
	const userId = args.user._id;

	let showDetail;
	let portfolioId;

	return Promise.all([AdviceModel.fetchAdvice({_id: adviceId, deleted:false}, {fields: 'advisor portfolio public subscribers'}),
			AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
			InvestorModel.fetchInvestor({user:userId}, {fields:'_id', insert: true})])
	.then(([advice, advisor, investor]) => {
		if (advice && advisor) {

			const advisorId = advisor._id;
			var activeSubscribers = advice.subscribers.filter(item => {return item.active == true}).map(item => item.investor.toString());
			const investorId = investor._id.toString();

			showDetail = advice.advisor.equals(advisorId) || activeSubscribers.indexOf(investorId) != -1;
			if (advice.advisor.equals(advisorId) || advice.public == true) {
				
				portfolioId = advice.portfolio;
				return Promise.all([
				 	_computeSimulatedPerformance(portfolioId),
				 	_computeLatestPerformance(portfolioId)
				 	]);
			} else {
				APIError.throwJsonError({userId: userId, message:"Not Authorized"});
			}
		} else {
			APIError.throwJsonError({userId: userId, message: "No Advice/Advisor found"});
		}
	})
	.then(([simulatedPerformance, currentPerformance]) => {
		return PerformanceModel.addPerformance({portfolio: portfolioId}, {current: currentPerformance, simulated: simulatedPerformance});
	})
	.then(performance => {

		if(performance) {
			var currentPerformance = performance.current;
			if (!showDetail && currentPerformance) {
				currentPerformance.metrics.forEach(item => {
					item.portfolioComposition = null;
					item.constituentPerformance = null;
				});
			}

			return res.status(200).send(performance);
		} else {
			APIError.throwJsonError({message: "Error updating performance"});
		}
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
			APIError.throwJsonError({message: "Invalid portfolio composition"});
		} 
	})
	.then(([portfolioComposition, constituentPerformance, portfolioPerformance]) => {
		return res.status(200).json({stockPerformance: constituentPerformance, portfolioPerformance: portfolioPerformance, portfolioComposition: portfolioComposition});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};
