/*
* @Author: Shiv Chawla
* @Date:   2018-03-29 09:15:44
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-07-18 19:51:45
*/
'use strict';
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const APIError = require('../../utils/error');
const WebSocket = require('ws'); 
const config = require('config');
const Promise = require('bluebird');
const csv = require('fast-csv');
const path = require('path');
const fs = require('fs');
const DateHelper = require('../../utils/Date');
const WSHelper = require('./WSHelper');
const _ = require('lodash');

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

		if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(performance.updatedDate)) == 1) {
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
		if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(performance.updatedDate)) == 1) {
			return true;
		}

    } else {
    	return true;
    }

    if(performance.detail && performance.detail.date) {
    	var performanceDetailDate = DateHelper.getDate(performance.detail.date);
		performanceDetailDate.setDate(performanceDetailDate.getDate() + 1);
		var currentDate = DateHelper.getCurrentDate();
		if(DateHelper.compareDates(currentDate, performanceDetailDate) == 1 && currentDate.getDay() !=0) {
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

	if (history.values && history.values.length == 0) {
		return true;
	}

	if(history && history.updatedDate) {
		
        if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(history.updatedDate)) == 1) {
        	return true;
        }

        var historyLastDate = DateHelper.getDate(history.values.slice(-1)[0].date);
		historyLastDate.setDate(historyLastDate.getDate() + 1);
		var currentDate = DateHelper.getCurrentDate();
        if(DateHelper.compareDates(currentDate, historyLastDate) == 1 && currentDate.getDay() !=0) {
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
        if(DateHelper.compareDates(DateHelper.getCurrentDate(), DateHelper.getDate(detail.updatedDate)) == 1) {
        	return true;
        }

        var detailLastDate = DateHelper.getDate(detail.values.Date);
		detailLastDate.setDate(detailLastDate.getDate() + 1);
		var currentDate = DateHelper.getCurrentDate()
        if(DateHelper.compareDates(currentDate, detailLastDate) == 1 && currentDate.getDay() !=0) {
        	return true;
        }
    } else {
    	return true;
    }

    return false;
}

function _getSecurityDetail(security) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"get_security_detail", 
            							security: security});

		WSHelper.handleMktRequest(msg, resolve, reject);

    })
};

module.exports.getStockPriceHistory = function(security, startDate, endDate) {
	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country};

	return SecurityPerformanceModel.fetchPriceHistory(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockPriceHistoryUpdateRequired(securityPerformance.priceHistory) : true;
		if(update) {
			return _computeStockPriceHistory(security).then(ph => {return SecurityPerformanceModel.updatePriceHistory(query, ph);});
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

module.exports.getStockRollingPerformance = function(security) {

	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country
				};

	return SecurityPerformanceModel.fetchRollingPerformance(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockRollingPerformanceUpdateRequired(securityPerformance.rollingPerformance) : true;
		if(update) {
			return _computeStockRollingPerformanceDetail(security).then(rp => {return SecurityPerformanceModel.updateRollingPerformance(query, rp);});;
		} else {
			return securityPerformance.toObject();
		}
	})
}

module.exports.getStockStaticPerformance = function(security) {

	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country};

	return SecurityPerformanceModel.fetchStaticPerformance(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockStaticPerformanceUpdateRequired(securityPerformance.staticPerformance) : true;
		if(update) {
			return _computeStockStaticPerformanceDetail(security).then(sp => {return SecurityPerformanceModel.updateStaticPerformance(query, sp);});
		} else {
			return securityPerformance.toObject();
		}
	});
};

module.exports.getStockLatestDetail = function(security, type) {
	return new Promise(resolve => {
		var query = {'security.ticker': security.ticker,
						'security.exchange': security.exchange ? security.exchange : "NSE",
						'security.securityType': security.securityType ? security.securityType : "EQ",
						'security.country': security.country ? security.country : "IN"};

		Promise.resolve() 
		.then(() => {
			return type == "EOD" ? SecurityPerformanceModel.fetchLatestDetail(query) : null;
		})
		.then(securityPerformance => {
			var update = securityPerformance ? _checkIfStockLatestDetailUpdateRequired(securityPerformance.latestDetail) : true;
			if(update) {
				return _computeStockLatestDetail(security, type)
				.then(detail => {
					if (type == "EOD") {
						return SecurityPerformanceModel.updateLatestDetail(query, detail)
						.then(performance => {
							resolve(performance.toObject());
						});
					} else {
						resolve(Object.assign({}, security, {latestDetail: detail}));
					}
					
				});
			} else {
				resolve(securityPerformance.toObject());
			}
		})
		.catch(err => {
			console.log(err.message);
			resolve(Object.assign({}, security, {latestDetail: {}}));
		})
	});
};

module.exports.countSecurities = function(hint) {
	
	return exports.findSecurities(hint, 0, "count");
};

module.exports.findSecurities = function(hint, limit, outputType) {
	return new Promise(function(resolve, reject) {

		var msg = JSON.stringify({action:"find_securities", 
	        			hint: hint ? hint : "", 
	        			limit: limit ? limit : 0, 
	        			outputType: outputType ? outputType : ""});

		WSHelper.handleMktRequest(msg, resolve, reject);

	});
};

module.exports.compareSecurity = function(oldSecurity, newSecurity) {
	return new Promise(function(resolve, reject) {
		
		var msg = JSON.stringify({action:"compare_security", 
	        				oldSecurity: oldSecurity,
	        				newSecurity: newSecurity});

		WSHelper.handleMktRequest(msg, resolve, reject);

	});
}

module.exports.validateSecurity = function(security) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"validate_security", 
            						security: security});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

function _computeStockStaticPerformanceDetail(security) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_static_performance", 
            						security: security});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
}

function _computeStockRollingPerformanceDetail(security) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_rolling_performance", 
            						security: security});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

function _computeStockPriceHistory(security) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_price_history", 
            						security: security});
         	
     	WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

function _computeStockLatestDetail(security, type) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_price_latest", 
            						security: security,
            						ptype: type ? type : "EOD"});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

function _computeStockPerformance(security) {
	return new Promise(resolve => {
		
		_getSecurityDetail(security)
			//_computeStockStaticPerformanceDetail(security),
			//_computeStockRollingPerformanceDetail(security),
			//_computeStockPriceHistory(security),
			//_computeStockLatestDetail(security)
		//])
		.then(securityDetail => { //, staticDetail, rollingDetail, priceHistory, latestDetail]) => {
			var updates = {
				"security.detail": securityDetail,
				//staticPerformance: {detail:staticDetail, updatedDate: new Date()}, 
				//rollingPerformance: {detail:rollingDetail, updatedDate: new Date()},
				//priceHistory: {values: priceHistory.filter(item => {return item.price !=null}), updatedDate: new Date()},
				//latestDetail: {values: latestDetail, updatedDate: new Date()},
			};

			resolve(updates);
		})
		.catch(err => {
			console.log(err.message);
			resolve({})
		})
	});
};

module.exports.updateStockList = function() {
	return exports.countSecurities()
	.then(count => {
		return exports.findSecurities("", 0);	
	})
	.then(securities => {
		return Promise.mapSeries(securities, function(security) {
			const query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country
				};

			const sec = {ticker: security.ticker,
					exchange: security.exchange,
					securityType: security.securityType,
					country: security.country
				};		
			return _computeStockPerformance(sec)
			.then(pf => {
				//console.log(pf);
				//return;
				return SecurityPerformanceModel.updateSecurityPerformance(query, pf);
			});	
		});
	})
	.catch(err => {
		console.log(err);
	})
};

module.exports.updateRealtimePrices = function(fname, type) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"update_realtime_prices", 
    					filename: fname,
    					type: type});

		WSHelper.handleMktRequest(msg, resolve, reject);
    })
};

module.exports.getStockList = function(search, options) {
	const universe = options.universe;
	const sector = options.sector;
	const industry = options.industry;
	const skip = _.get(options, 'skip', 0);
	const limit = _.get(options, 'limit', 0);

	return Promise.resolve()
	.then(() => {	
		return new Promise(resolve => {
			if (universe) {

				let universeList = [];
				const fname = path.resolve(path.join(__dirname, `../../documents/universe/ind_${universe.replace(new RegExp("_",'g'),"").toLowerCase()}list.csv`));
				
				if (fs.existsSync(fname)){
					
					csv.fromPath(fname, {headers:true})
				    .on("data", function(data){
				        universeList.push(data.Symbol);
				    })
				    .on("end", function(){
				        resolve(universeList);
				    })
				    .on("error" , function() {
				    	resolve([]);
				    });
				} else {
					resolve([]);
				}
			} else {
				resolve([]);
			}
		});
	})
	.then(universeList => {

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

	    let qSector = {}; 
	    if (sector) {
	    	var sectorArray = sector.split(",").map(item => item.trim());
	    	qSector = {$or: [{'security.detail.Sector': {$in: sectorArray}}, {'security.detail.Sector': {$exists: false}}]};
		}

		let qIndustry = {}; 
	    if (industry) {
	    	var industryArray = industry.split(",").map(item => item.trim());
	    	qIndustry = {$or: [{'security.detail.Industry': {$in: industryArray}}, {'security.detail.Industry': {$exists: false}}]};
		} 

		let qUniverse = {}
		if (universeList.length > 0) {
			qUniverse = {'security.ticker' : {$in: universeList}}
		}		

	    var containsNIFTY = "^NIFTY.*$";
	    var q10 = {'security.ticker': {$regex: containsNIFTY}}; 
	    
	    var onlyStockQueries = universe || sector || industry;

	    var query_1 =  {$and: [q1, q3, q4, q5, q6, q7, q8, q9, qSector, qIndustry, qUniverse]}; 
	    var query_21 = {$and: [q21, q3, q4, q5, q6, q7, q8, q9, qSector, qIndustry, qUniverse]};
	    var query_22 = {$and: [q22, q3, q4, q5, q6, q7, q8, q9, qSector, qIndustry, qUniverse]};
	    var query_3 = {$and: [q1, q3, q4, q5, q6, q7, q8, q10]};
	    var query_4 = {$and: [q21, q3, q4, q5, q6, q7, q8, q10]};

	    //exactMatch, nearMatchTicker, nearMatchName, niftyExactMatch, niftyNearMatch
		return Promise.all([
			SecurityPerformanceModel.fetchSecurityPerformances(query_1, {fields:'security', skip:skip, limit: limit, sort:{weight: -1}}),
			SecurityPerformanceModel.fetchSecurityPerformances(query_21, {fields:'security', skip:skip, limit: limit, sort:{weight: -1}}),
			SecurityPerformanceModel.fetchSecurityPerformances(query_22, {fields:'security', skip:skip, limit: limit, sort:{weight: -1}}),
			!onlyStockQueries ? SecurityPerformanceModel.fetchSecurityPerformances(query_3, {fields:'security', skip:skip, limit: limit, sort:{weight: -1}}) : [],
			!onlyStockQueries ? SecurityPerformanceModel.fetchSecurityPerformances(query_4, {fields:'security', skip:skip, limit: limit, sort:{weight: -1}}) : [],
		]);
	})
	.then(([exactMatch, nearMatchTicker, nearMatchName, niftyExactMatch, niftyNearMatch]) => {

		var securitiesExactMatch = exactMatch.map(item => item.security);
		var securitiesNearMatchTicker = nearMatchTicker.map(item => item.security);
		var securitiesNearMatchName = nearMatchName.map(item => item.security);
		var securitiesNiftyExactMatch = niftyExactMatch.map(item => item.security);
		var securitiesNiftyNearMatch = niftyNearMatch.map(item => item.security);

		var totalSecurities = securitiesExactMatch.concat(securitiesNearMatchTicker).concat(securitiesNearMatchName).concat(securitiesNiftyExactMatch).concat(securitiesNiftyNearMatch);
		
		//REMOVE DUPLICATES
		totalSecurities = totalSecurities.filter((item, pos, arr) => {
				return arr.map(itemS => itemS["ticker"]).indexOf(item["ticker"])==pos;});

		return limit > 0 ? totalSecurities.slice(0, limit) : totalSecurities;
	});
};
