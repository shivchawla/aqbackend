/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:45:08
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-12 12:39:07
*/

'use strict';
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const Promise = require('bluebird');
const config = require('config');
const SecurityHelper = require("../helpers/Security");
const APIError = require('../../utils/error');
const DateHelper = require('../../utils/Date');

function getDate(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getYear();

    return d+"-"+m+"-"+y;
}

function _checkIfStockStaticPerformanceUpdateRequired(performance) {
	if (!performance) {
		return true;
	}

	if(performance && performance.updatedDate) {
		var months = Object.keys(performance.detail.monthly).sort();
		var years = Object.keys(performance.detail.yearly).sort();

		var d = new Date();
		var currentMonth = d.getYear().toString()+"_"+(d.getMonth()+1).toString();
		var currentYear = d.getYear().toString();

		if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(performance.updatedDate)) == -1) {
			return true;
		}

        if(months.indexOf(currentMonth) == -1 || years.indexOf(currentYear) == -1) {
        	return true; //TEMPORARILY
        	return true;
        }
    } else {
    	return true;
    }

    return false;
}

function _checkIfStockRollingPerformanceUpdateRequired(performance) {
	if (!performance) {
		return true;
	}

	if(performance && performance.updatedDate) {

		if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(performance.updatedDate)) == -1) {
			return true;
		}

    } else {
    	return true;
    }

    return false;
}

function _checkIfStockPriceHistoryUpdateRequired(history) {
	if (!history) {
		return true;
	}

	if(history && history.updatedDate) {
        if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(history.updatedDate)) == -1) {
        	return true;
        }
    } else {
    	return true;
    }

    return false;
}

function _checkIfStockLatestDetailUpdateRequired(detail) {
	if (!detail) {
		return true;
	}

	if(detail && detail.updatedDate) {
        if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(detail.updatedDate)) == -1) {
        	return true;
        }
    } else {
    	return true;
    }

    return false;
}

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

function getStockPriceHistory(security, startDate, endDate) {
	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country};

	return SecurityPerformanceModel.fetchPriceHistory(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockPriceHistoryUpdateRequired(securityPerformance.priceHistory) : true;
		if(update) {
			return SecurityHelper.computeStockPriceHistory(security).then(ph => {return SecurityPerformanceModel.updatePriceHistory(query, ph);});
		} else {
			return securityPerformance;
		}
	})
	.then(securityPerformance => {
		var ph = securityPerformance.priceHistory.values;
		if (startDate) {
			var idx = ph.map(item => item.date).findIndex(item => {return new Date(item).getTime() >= new Date(startDate).getTime();});
			ph = idx != -1 ? ph.slice(idx, ph.length) : ph;
		}

		if (endDate) {
			var idx = ph.map(item => item.date).findIndex(item => {return new Date(item).getTime() >= new Date(endDate).getTime()});

			idx =  new Date(ph[idx].date).getTime() == new Date(endDate).getTime() ? idx : idx > 0 ? idx - 1 : idx;
			ph = idx != -1 ? ph.slice(0, idx+1) : ph;
		}

		return {security: securityPerformance.security, priceHistory: ph};
	});
};

function getStockRollingPerformance(security) {

	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country
				};

	return SecurityPerformanceModel.fetchRollingPerformance(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockRollingPerformanceUpdateRequired(securityPerformance.rollingPerformance) : true;
		if(update) {
			return SecurityHelper.computeStockRollingPerformanceDetail(security).then(rp => {return SecurityPerformanceModel.updateRollingPerformance(query, rp);});;
		} else {
			return securityPerformance;
		}
	})
}

function getStockStaticPerformance(security) {

	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country};

	return SecurityPerformanceModel.fetchStaticPerformance(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockStaticPerformanceUpdateRequired(securityPerformance.staticPerformance) : true;
		if(update) {
			return SecurityHelper.computeStockStaticPerformanceDetail(security).then(sp => {return SecurityPerformanceModel.updateStaticPerformance(query, sp);});
		} else {
			return securityPerformance;
		}
	});
};

function getStockLatestDetail(security) {
	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country};

	return SecurityPerformanceModel.fetchLatestDetail(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockLatestDetailUpdateRequired(securityPerformance.latestDetail) : true;
		if(update) {
			return SecurityHelper.computeStockLatestDetail(security).then(latestDetail => {return SecurityPerformanceModel.updateLatestDetail(query, latestDetail);});
		} else {
			return securityPerformance;
		}
	});
};

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
			return getStockPriceHistory(security, startDate, endDate);
		} else if (field == "staticPerformance") {
			return getStockStaticPerformance(security);
		} else if (field == "rollingPerformance") {
			return getStockRollingPerformance(security);
		} else if (field == "latestDetail") {
			return getStockLatestDetail(security);
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

		var totalSecurities = securitiesNiftyExactMatch.concat(securitiesNiftyNearMatch).concat(securitiesExactMatch).concat(securitiesNearMatchTicker).concat(securitiesNearMatchName);
		var totalSecurities = totalSecurities.filter((item, pos, arr) => {return arr.map(itemS => itemS["ticker"]).indexOf(item["ticker"])==pos;}).slice(0, 10);;
		return res.status(200).send(totalSecurities);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	}); 
};
