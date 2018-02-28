/*
* @Author: Shiv Chawla
* @Date:   2018-01-23 19:00:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-28 18:54:23
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
const PerformanceHelper = require("../helpers/Performance");

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
						return PerformanceHelper.computeLatestPerformance(portfolioId);
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
			return PerformanceModel.updatePerformance({portfolio: portfolioId}, {current: latestPerformance});
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
				 	PerformanceHelper.computeSimulatedPerformance(portfolioId),
				 	PerformanceHelper.computeLatestPerformance(portfolioId)
				 	]);
			} else {
				APIError.throwJsonError({userId: userId, message:"Not Authorized"});
			}
		} else {
			APIError.throwJsonError({userId: userId, message: "No Advice/Advisor found"});
		}
	})
	.then(([simulatedPerformance, currentPerformance]) => {

		if (simulatedPerformance || currentPerformance) {
			const updates = {};
			if (simulatedPerformance) {
				updates["simulated"] = simulatedPerformance;
			}

			if(currentPerformance) {
				updates["current"] = currentPerformance;
			}

			return PerformanceModel.updatePerformance({portfolio: portfolioId}, updates);
		} else {
			return PerformanceModel.fetchPerformance({portfolio: portfolioId});
		}
		
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

	return PerformanceHelper.computePerformanceHypthetical(portfolio)
	.then(performance => {
		return res.status(200).send(performance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};
