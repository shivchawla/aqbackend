/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:45:08
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-08-29 11:18:10
*/

'use strict';
const SecurityPerformanceModel = require('../models/SecurityPerformance');
const Promise = require('bluebird');
const config = require('config');
const HelperFunctions = require("./helpers");
const APIError = require('../utils/error');

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

exports.getStockDetail = function(args, res, next) {

	const ticker = args.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const field = args.field.value;
	const security = {ticker: ticker,
						exchange: exchange,
						securityType: securityType,
						country: country};

	console.log(security);

	var q = {'security.ticker': ticker,
					'security.exchange': exchange,
					'security.securityType': securityType,
					'security.country': country};

	SecurityPerformanceModel.fetchSecurityPerformance(q, {fields:field})
	.then(securityPerformance => {
		if(!securityPerformance) {
			return SecurityPerformanceModel.saveSecurityPerformance({security: security})
		} else {
			return securityPerformance;
		}
	})
	.then(securityPerformance => {
		if(field == "priceHistory") {
			return getStockPriceHistory(res, q, security);
		} else if (field == "staticPerformance") {
			return getStockStaticPerformance(res, q, security);
		} else if (field == "rollingPerformance") {
			return getStockRollingPerformance(res, q, security);
		} else if (field == "latestDetail") {
			return getStockLatestDetail(res, q, security);
		}

	});
};

function getStockPriceHistory(res, q, security) {
	/*const ticker = args.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const security = {ticker: ticker,
						exchange: exchange,
						securityType: securityType,
						country: country};

	console.log(security);*/

	SecurityPerformanceModel.fetchPriceHistory(q)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockPriceHistoryUpdateRequired(securityPerformance.priceHistory) : true;
		if(update) {
			return Promise.all([true, HelperFunctions.updateStockPriceHistory(q, security)]);
		} else {
			return [false, securityPerformance];
		}
	})

	.then(([updated, securityPerformance]) => {
		console.log(updated);
		if(updated) {
			return SecurityPerformanceModel.fetchPriceHistory(q);
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

function getStockRollingPerformance(res, q, security) {

	/*const ticker = args.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const security = {ticker: ticker,
						exchange: exchange,
						securityType: securityType,
						country: country};

	console.log(security);*/

	SecurityPerformanceModel.fetchRollingPerformance(q)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockRollingPerformanceUpdateRequired(securityPerformance.rollingPerformance) : true;
		if(update) {
			return Promise.all([true, HelperFunctions.updateStockRollingPerformanceDetail(q, security)]);
		} else {
			console.log("LUNDDD");
			console.log(securityPerformance);
			return [false, securityPerformance];
		}
	})

	.then(([updated, securityPerformance]) => {
		console.log(updated);
		if(updated) {
			return SecurityPerformanceModel.fetchRollingPerformance(q);
		} else {
			return securityPerformance;//{security: security, rollingPerformance: performance};
		}
	})
	.then(securityPerformance => {
		return res.status(200).json(securityPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
}

function getStockStaticPerformance(res, q, security) {

	/*const ticker = args.ticker.value;
	const exchange = args.exchange.value;
	const securityType = args.securityType.value;
	const country = args.country.value;

	const security = {ticker: ticker,
						exchange: exchange,
						securityType: securityType,
						country: country};

	console.log(security);*/

	SecurityPerformanceModel.fetchStaticPerformance(q)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockStaticPerformanceUpdateRequired(securityPerformance.staticPerformance) : true;
		if(update) {
			return Promise.all([true, HelperFunctions.updateStockStaticPerformanceDetail(q, security)]);
		} else {
			return [false, securityPerformance];
		}
	})

	.then(([updated, securityPerformance]) => {
		if(updated) {
			return SecurityPerformanceModel.fetchStaticPerformance(q);
		} else {
			return securityPerformance;//{security: security, staticPerformance: performance};
		}
	})
	.then(securityPerformance => {
		return res.status(200).json(securityPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

function getStockLatestDetail(res, q, security) {
	SecurityPerformanceModel.fetchLatestDetail(q)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockLatestDetailUpdateRequired(securityPerformance.latestDetail) : true;
		if(update) {
			return Promise.all([true, HelperFunctions.updateStockLatestDetail(q, security)]);
		} else {
			return [false, securityPerformance];
		}
	})
	.then(([updated, securityPerformance]) => {
		if(updated) {
			return SecurityPerformanceModel.fetchLatestDetail(q);
		} else {
			return securityPerformance;//{security: security, staticPerformance: performance};
		}
	})
	.then(securityPerformance => {
		return res.status(200).json(securityPerformance);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};
