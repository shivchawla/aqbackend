/*
* @Author: Shiv Chawla
* @Date:   2018-01-23 19:00:00
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-28 20:22:18
*/

'use strict'
const InvestorModel = require('../../models/Marketplace/Investor');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const AdviceModel = require('../../models/Marketplace/Advice');
const ContestEntryModel = require('../../models/Marketplace/ContestEntry');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const PerformanceModel = require('../../models/Marketplace/Performance');
const APIError = require('../../utils/error');
const Promise = require('bluebird');
const PerformanceHelper = require("../helpers/Performance");

module.exports.getPerformanceInvestorPortfolio = function(args, res, next) {
	const investorId = args.investorId.value;
	const portfolioId = args.portfolioId.value;
	const userId = args.user._id;

	return InvestorModel.fetchInvestor({user: userId}, {fields: 'user portfolios', insert: true})
	.then(investor => {
		if (investor) {
			if (investor.user.equals(userId)) {
				if(investor.portfolios) {
					if (investor.portfolios.filter(item => !item.deleted).map(item => item.toString()).indexOf(portfolioId) != -1) {
						return PerformanceHelper.getAllPerformance(portfolioId);
					} else {
						APIError.throwJsonError({userId: userId, message: "Investor not authorized to view", errorCode: 1304});
					}
				} else {
					APIError.throwJsonError({userId: userId, message: "No investor porfolios found", errorCode: 1305});
				}
			} else {
				APIError.throwJsonError({userId: userId, message: "Investor not authorized to view", errorCode: 1304})
			}
			
		} else {
			APIError.throwJsonError({userId: userId, message: "Investor not found", errorCode: 1301});
		}
	})
	.then(performance => {
		if (performance) {
			return res.status(200).send(performance);
		} else {
			APIError.throwJsonError({message: "Internal calulating portfolio performance", errorCode: 1604});
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
				return PerformanceHelper.getAllPerformance(portfolioId);
			} else {
				APIError.throwJsonError({userId: userId, message:"Investor not authorized to view", errorCode: 1304});
			}
		} else if(!advice) {
			APIError.throwJsonError({userId: userId, message: "Advice not found", errorCode: 1101});
		} else if(!advisor) {
			APIError.throwJsonError({userId: userId, message: "Advisor not found", errorCode: 1201});
		}
	})
	.then(performance => {
		if(performance) {
			var currentPerformance = performance.current;
			if (!showDetail && currentPerformance) {
				//Remove the composition and constituent performance if 
				//user is not authorized to view detail
				currentPerformance.metrics.portfolioMetrics	= null;
				currentPerformance.metrics.constituentPerformance = null;
			}

			return res.status(200).send(performance);
		} else {
			APIError.throwJsonError({message: "Internal calculating portfolio performance", errorCode: 1604});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

module.exports.getPerformanceContestEntryPortfolio = function(args, res, next) {
		
	const entryId = args.entryId.value;
	const userId = args.user._id;

	let showDetail;
	let portfolioId;

	return Promise.all([
			ContestEntryModel.fetchAdvice({_id: entryId, deleted:false}, {fields: 'advisor portfolio'}),
			AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id'}),
			InvestorModel.fetchInvestor({user:userId}, {fields:'_id', insert: true})])
	.then(([contestEntry, advisor, investor]) => {
		if (contestEntry && advisor) {
			const advisorId = advisor._id;
			const investorId = investor._id.toString();

			showDetail = contestEntry.advisor.equals(advisorId);
			if (showDetail) {
				portfolioId = contestEntry.portfolio;
				return PerformanceHelper.getAllPerformance(portfolioId);
			} else {
				APIError.throwJsonError({userId: userId, message:"Investor not authorized to view", errorCode: 1304});
			}
		} else if(!contestEntry) {
			APIError.throwJsonError({userId: userId, message: "Contest entry not found", errorCode: 1101});
		} else if(!advisor) {
			APIError.throwJsonError({userId: userId, message: "Advisor not found", errorCode: 1201});
		}
	})
	.then(performance => {
		if(performance) {
			var currentPerformance = performance.current;
			if (!showDetail && currentPerformance) {
				//Remove the composition and constituent performance if 
				//user is not authorized to view detail
				currentPerformance.metrics.portfolioMetrics	= null;
				currentPerformance.metrics.constituentPerformance = null;
			}

			return res.status(200).send(performance);
		} else {
			APIError.throwJsonError({message: "Internal calculating portfolio performance", errorCode: 1604});
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
