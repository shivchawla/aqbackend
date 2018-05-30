/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:45:08
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-05-27 23:33:29
*/

'use strict';
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const Promise = require('bluebird');
const config = require('config');
const SecurityHelper = require("../helpers/Security");
const APIError = require('../../utils/error');

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
			return Promise.all([
				SecurityHelper.getStockLatestDetail(security, "EOD"),
				SecurityHelper.getStockLatestDetail(security, "RT")
			])
			.then(([detailEOD, detailRT]) => {
				var rtLatestDetail = detailRT && detailRT.latestDetail ? detailRT.latestDetail : {};
				return Object.assign(detailEOD, {latestDetailRT: rtLatestDetail});
			})
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
	const search = args.search.value ? args.search.value : ""; 

	var startWithSearch = `(^${search}.*)$`; 
	var q1 = {'security.ticker': {$regex: startWithSearch, $options: "i"}};

	//CAN be improved to first match in ticker and then 
	var containsSearch = `^(.*?(${search})[^$]*)$`;
	var q21 = {'security.ticker': {$regex: containsSearch, $options: "i"}};
	var q22 = {'security.detail.Nse_Name': {$regex: containsSearch, $options: "i"}};

	var nostartwithCNX = "^((?!^CNX).)*$"
    var q3 = {'security.ticker': {$regex: nostartwithCNX}};

    var nostartwithMF = "^((?!^MF).)*$"
    var q4 = {'security.ticker': {$regex: nostartwithMF}};

    var nostartwithLIC = "^((?!^LIC).)*$"
    var q5 = {'security.ticker': {$regex: nostartwithLIC}};

    var nostartwithICNX = "^((?!^ICNX).)*$"
    var q6 = {'security.ticker': {$regex: nostartwithICNX}};

    var nostartwithSPCNX = "^((?!^SPCNX).)*$"
    var q7 = {'security.ticker': {$regex: nostartwithSPCNX}};

    var q8 = {'security.ticker':{$ne: ""}};

    var q9 = {'security.detail.Nse_Name': {$exists: true}};

    var containsNIFTY = "^NIFTY.*$";
    var q10 = {'security.ticker': {$regex: containsNIFTY}}; 
    
    var query_1 = {$and: [q1, q3, q4, q5, q6, q7, q8, q9]}; 
    var query_21 = {$and: [q21, q3, q4, q5, q6, q7, q8, q9]};
    var query_22 = {$and: [q22, q3, q4, q5, q6, q7, q8, q9]};
    var query_3 = {$and: [q1, q3, q4, q5, q6, q7, q8, q10]};
    var query_4 = {$and: [q21, q3, q4, q5, q6, q7, q8, q10]};

	return Promise.all([
		SecurityPerformanceModel.fetchSecurityPerformances(query_1, {fields:'security', limit: 10, sort:{weight: -1}}),
		SecurityPerformanceModel.fetchSecurityPerformances(query_21, {fields:'security', limit: 10, sort:{weight: -1}}),
		SecurityPerformanceModel.fetchSecurityPerformances(query_22, {fields:'security', limit: 10, sort:{weight: -1}}),
		SecurityPerformanceModel.fetchSecurityPerformances(query_3, {fields:'security', limit: 10, sort:{weight: -1}}),
		SecurityPerformanceModel.fetchSecurityPerformances(query_4, {fields:'security', limit: 10, sort:{weight: -1}}),
	])
	.then(([exactMatch, nearMatchTicker, nearMatchName, niftyExactMatch, niftyNearMatch]) => {
		var securitiesExactMatch = exactMatch.map(item => item.security);
		var securitiesNearMatchTicker = nearMatchTicker.map(item => item.security);
		var securitiesNearMatchName = nearMatchName.map(item => item.security);
		var securitiesNiftyExactMatch = niftyExactMatch.map(item => item.security);
		var securitiesNiftyNearMatch = niftyNearMatch.map(item => item.security);

		var totalSecurities = securitiesExactMatch.concat(securitiesNearMatchTicker).concat(securitiesNearMatchName).concat(securitiesNiftyExactMatch).concat(securitiesNiftyNearMatch);
		
		//REMOVE DUPLICATES
		totalSecurities = totalSecurities.filter((item, pos, arr) => {
				return arr.map(itemS => itemS["ticker"]).indexOf(item["ticker"])==pos;}).slice(0, 10);;
		return res.status(200).send(totalSecurities);
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
    "NIFTY_SERV_SECTOR"].indexOf(ticker) !=-1) {
    	return exports.getStockDetail(args, res, next);
    } else {
    	return res.status(400).send(`Invalid benchmark ticker: ${ticker}`);
    }
};
