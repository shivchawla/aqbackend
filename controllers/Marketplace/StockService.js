/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:45:08
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-29 21:03:08
*/

'use strict';
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const Promise = require('bluebird');
const config = require('config');
const SecurityHelper = require("../helpers/Security");
const APIError = require('../../utils/error');

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

		if(getDate(new Date()) <= getDate(performance.updatedDate)) {
			return false;
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

		if(getDate(new Date()) <= getDate(performance.updatedDate)) {
			return false;
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
        if(getDate(new Date()) > getDate(history.updatedDate)) {
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
        if(getDate(new Date()) > getDate(detail.updatedDate)) {
        	return true;
        }
    } else {
    	return true;
    }

    return false;
}

function getStockPriceHistory(res, security, startDate, endDate) {
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

		return res.status(200).json({security: securityPerformance.security, priceHistory: ph});
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

function getStockRollingPerformance(res, security) {

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
	.then(securityPerformance => {
		return res.status(200).json(securityPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
}

function getStockStaticPerformance(res, security) {

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
	})
	.then(securityPerformance => {
		return res.status(200).json(securityPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

function getStockLatestDetail(res, security) {
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
	})
	.then(securityPerformance => {
		return res.status(200).json(securityPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
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

	return SecurityPerformanceModel.fetchSecurityPerformance(query, {fields:field})
	.then(securityPerformance => {
		if(!securityPerformance) {
			return SecurityPerformanceModel.saveSecurityPerformance({security: security})
		} else {
			return securityPerformance;
		}
	})
	.then(securityPerformance => {
		if(field == "priceHistory") {
			return getStockPriceHistory(res, security, startDate, endDate);
		} else if (field == "staticPerformance") {
			return getStockStaticPerformance(res, security);
		} else if (field == "rollingPerformance") {
			return getStockRollingPerformance(res, security);
		} else if (field == "latestDetail") {
			return getStockLatestDetail(res, security);
		}
	});

};

module.exports.getStocks = function(args, res, next) {
	const search = args.search.value ? args.search.value : ""; 
	
	var containsSearch = `^(.*?(${search})[^$]*)$`;
	var q1 = {$or: [{'security.ticker': {$regex: containsSearch, $options: "i"}}, {'security.detail.Nse_Name': {$regex: containsSearch, $options: "i"}}]}

	var nostartwithCNX = "^((?!^CNX).)*$"
    var q2 = {'security.ticker': {$regex: nostartwithCNX}};

    var nostartwithMF = "^((?!^MF).)*$"
    var q3 = {'security.ticker': {$regex: nostartwithMF}};

    var nostartwithLIC = "^((?!^LIC).)*$"
    var q4 = {'security.ticker': {$regex: nostartwithLIC}};

    var nostartwithICNX = "^((?!^ICNX).)*$"
    var q5 = {'security.ticker': {$regex: nostartwithICNX}};

    var nostartwithSPCNX = "^((?!^SPCNX).)*$"
    var q6 = {'security.ticker': {$regex: nostartwithSPCNX}};

    var query = {$and: [q1, q2, q3, q4, q5, q6]};
	return SecurityPerformanceModel.fetchSecurityPerformances(query, {fields:'security', limit: 10})
	.then(sp => {
		return res.status(200).send(sp.map(item => item.security));
	})
	.catch(err => {
		return res.status(400).send(err.message);
	}); 
};
