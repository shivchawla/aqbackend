/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:45:08
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-07-01 14:44:28
*/

'use strict';
const AdvisorModel = require('../models/advisor');
const InvestorModel = require('../models/investor');
const AdviceModel = require('../models/advice');
const UserModel = require('../models/user');
const PortfolioModel = require('../models/portfolio');
const Promise = require('bluebird');
const config = require('config');
const HelperFunctions = require("./helpers");
const APIError = require('../utils/error');


exports.getStockPerformanceDetail = function(args, res, next) {
	const ticker = ags.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const security = {ticker: ticker, 
						exchange: exchange, 
						securityType: securityType,
						country: country};


	return HelperFunctions.getStockPerformanceDetail(security)
	.then(performance => {
		return res.status(200).json(performance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
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

	return InvestorModel.fetchInvestor({user: userId},{fields: 'portfolios'})
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

exports.getAdvisorAdvicesWithStock = function(args, res, next) {
	const userId = args.user._id;

	const ticker = ags.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const security = {ticker: ticker, 
						exchange: exchange, 
						securityType: securityType,
						country: country};

	return AdvisorModel.fetchAdvisor({user: userId},{fields:'advices'})
	.then(advisor => {
		if(advisor) {
			if(advisor.advices) {
				return Promise.all([advisor.advices.forEach(advice => {
						return AdviceModel.fetchAdvice({_id: advice._id}, {fields: 'portfolio'})
					})]);
			} else {
				APIError.throwJsonError({msg: "No advices found"});
			}
		} else {
			APIError.throwJsonError({userId: userId, msg: "No advisor found"})
		}
	})
	.then(([advices])=> {
		if(advices) {
			var advicesWithStock = [];
			advices.forEach(advice => {
				var idx = advice.portfolio.positions.map(item => item.security).indexOf(security);
				
				if (idx != -1) {
					advicesWithStock.push({
							_id: advice._id,
							name: advice.name,
							description: advice.description,
							position: advice.portfolio.positions[idx]
						});
				}

			});

			return res.status(200).json(advicesWithStock);

		} else {
			APIError.throwJsonError({msg: "No advices found"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})    
};


