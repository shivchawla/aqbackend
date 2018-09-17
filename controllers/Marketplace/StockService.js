/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:45:08
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-17 10:58:31
*/

'use strict';
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const Promise = require('bluebird');
const config = require('config');
const SecurityHelper = require("../helpers/Security");
const APIError = require('../../utils/error');
const _ = require('lodash');

function updateStockWeight(query) {
	return SecurityPerformanceModel.fetchSecurityPerformance(query, {fields: 'weight'})
	.then(sp => {
		if(sp) {
			var nWeight = sp.weight ? sp.weight + 0.001 : 0.001;
			return SecurityPerformanceModel.updateSecurityPerformance(query, {weight: nWeight});
		} else{
			return {};
			//APIError.throwJSONError({message: "Security not found. Can't update weight"});
		}
	})
}

function _getStockLatestDetail(security) {
	return Promise.all([
		SecurityHelper.getStockLatestDetail(security, "EOD"),
		SecurityHelper.getStockLatestDetail(security, "RT")
	])
	.then(([detailEOD, detailRT]) => {

		var rtLatestDetail = detailRT && detailRT.latestDetail ? detailRT.latestDetail : {};
		return Object.assign(detailEOD, {latestDetailRT: rtLatestDetail});
	})
}

module.exports.getStockDetail = function(args, res, next) {

	const ticker = args.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;
	const startDate = args.startDate.value;
	const endDate = args.endDate.value;

	const field = args.field.value;
	const security = {ticker: ticker,
						exchange: exchange,
						securityType: securityType,
						country: country};

	var query = {'security.ticker': ticker,
					'security.exchange': exchange,
					'security.securityType': securityType,
					'security.country': country};
	return Promise.all([
		SecurityPerformanceModel.fetchSecurityPerformance(query, {fields:field}),
		updateStockWeight(query)
	])
	.then(([securityPerformance, updatedWeight]) => {
		if(!securityPerformance) {
			return SecurityHelper.validateSecurity(security)
			.then(valid => {
				if (valid) {
					return SecurityPerformanceModel.saveSecurityPerformance({security: security});
				} else {
					APIError.throwJSONError({message: "Invalid Security"});
				}
			});
		} else {
			return securityPerformance;
		}
	})
	.then(securityPerformance => {
		if(field == "priceHistory") {
			return SecurityHelper.getStockPriceHistory(security, startDate, endDate);
		} else if (field == "staticPerformance") {
			return SecurityHelper.getStockStaticPerformance(security);
		} else if (field == "rollingPerformance") {
			return SecurityHelper.getStockRollingPerformance(security);
		} else if (field == "latestDetail") {
			return _getStockLatestDetail(security);	
		} 
	})
	.then(output => {
		return res.status(200).send(output);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
};

module.exports.getStocks = function(args, res, next) {
	const search = _.get(args, 'search.value', "")
	const sector = _.get(args, 'sector.value', null);
	const industry = _.get(args, 'industry.value', null);
	const universe = _.get(args, 'universe.value', null);
	//Get the fields to be populated, default is NONE
	const populate = _.get(args, 'populate.value', false);
	
	const skip = _.get(args, 'skip.value', 0);
	const limit = _.get(args, 'limit.value', 5); 

	return SecurityHelper.getStockList(search, {universe: universe, sector: sector, industry: industry, skip: skip, limit: limit})
	.then(securities => {
		return Promise.map(securities, function(security) {
			return populate ? _getStockLatestDetail(security) : security;
		});
	})
	.then(output => {
		return res.status(200).send(output);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	});
	 
};

module.exports.getStockDetailBenchmark = function(args, res, next) {
	const ticker = args.ticker.value;

	if (["NIFTY_50", 
    "NIFTY_100",
    "NIFTY_200",
    "NIFTY_500",
    "NIFTY_MIDCAP_50",
    "NIFTY_AUTO",
    "NIFTY_BANK",
    "NIFTY_FIN_SERVICE",
    "NIFTY_FMCG",
    "NIFTY_IT",
    "NIFTY_MEDIA",
    "NIFTY_METAL",
    "NIFTY_PHARMA",
    "NIFTY_PSU_BANK",
    "NIFTY_REALTY",
    "NIFTY_COMMODITIES",
    "NIFTY_CPSE",
    "NIFTY_ENERGY",
    "NIFTY_INFRA",
    "NIFTY_MNC",
    "NIFTY_SERV_SECTOR",
    "NIFTY_CONSUMPTION"].indexOf(ticker) !=-1) {
    	return exports.getStockDetail(args, res, next);
    } else {
    	return res.status(400).send(`Invalid benchmark ticker: ${ticker}`);
    }
};
