/*
* @Author: Shiv Chawla
* @Date:   2018-03-29 09:15:44
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-23 13:09:31
*/
'use strict';
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const APIError = require('../../utils/error');
const WebSocket = require('ws'); 
const config = require('config');
const Promise = require('bluebird');
const DateHelper = require('../../utils/Date');

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

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"get_security_detail", 
            							security: security});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

        	if (data["error"] == "" && data["securityDetail"]) {
			    resolve(data["securityDetail"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error in computing stock latest detail", errorCode: 2101}));
		    }
	    });
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
			return securityPerformance;
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
			return securityPerformance;
		}
	});
};

module.exports.getStockLatestDetail = function(security, type) {
	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange ? security.exchange : "NSE",
					'security.securityType': security.securityType ? security.securityType : "EQ",
					'security.country': security.country ? security.country : "IN"};

	return Promise.resolve() 
	.then(() => {
		return type == "EOD" ? SecurityPerformanceModel.fetchLatestDetail(query) : null;
	})
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockLatestDetailUpdateRequired(securityPerformance.latestDetail) : true;
		if(update) {
			return _computeStockLatestDetail(security, type)
			.then(detail => {
				return type=="EOD" ? SecurityPerformanceModel.updateLatestDetail(query, detail) : Object.assign({}, security, {latestDetail: detail});
			});
		} else {
			return securityPerformance;
		}
	});
};

module.exports.countSecurities = function(hint) {
	
	return exports.findSecurities(hint, 0, "count");
};

module.exports.findSecurities = function(hint, limit, outputType) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action:"find_securities", 
	        			hint: hint ? hint : "", 
	        			limit: limit ? limit : 0, 
	        			outputType: outputType ? outputType : ""});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	
	    	if(data['error'] == '' && data['securities']) {
	    		resolve(data['securities']);
			} else if (data['error'] != '') {
				console.log(data['error'])
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error in fetching security", errorCode: 2101}));
			}
		});
	});
};

module.exports.compareSecurity = function(oldSecurity, newSecurity) {
	return new Promise(function(resolve, reject) {
		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
	        console.log('Connection Open');
	        console.log(connection);
	        var msg = JSON.stringify({action:"compare_security", 
	        				oldSecurity: oldSecurity,
	        				newSecurity: newSecurity});

	     	wsClient.send(msg);
	    });

	    wsClient.on('message', function(msg) {
	    	var data = JSON.parse(msg);
	    	
	    	if(data['error'] == '' && data['compare']) {
	    		resolve(data['compare']);
			} else if (data['error'] != '') {
				reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
			} else {
				reject(APIError.jsonError({message: "Internal error in comparing security", errorCode: 2101}));
			}
		});
	});
}

module.exports.validateSecurity = function(security) {

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_security", 
            						security: security});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			
        	if (data["error"] == "") {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error validating the security", errorCode: 2101}));
		    }
	    });
    })
};

function _computeStockStaticPerformanceDetail(security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_static_performance", 
            						security: security});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			
        	if (data["error"] == "" && data["performance"]) {
			    resolve(data["performance"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error in computing stock static performance detail", errorCode: 2101}));
		    }
	    });
    });
}

function _computeStockRollingPerformanceDetail(security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_rolling_performance", 
            						security: security});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {

        	var data = JSON.parse(msg);
        	if (data["error"] == "" && data["performance"]) {
			    resolve(data["performance"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error in computing stock rolling performance detail", errorCode: 2101}));
		    }
	    });
    });
};

function _computeStockPriceHistory(security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_price_history", 
            						security: security});
         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

        	if (data["error"] == "" && data["priceHistory"]) {
			    resolve(data["priceHistory"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error in computing stock price history", errorCode: 2101}));
		    }
	    });
    });
};

function _computeStockLatestDetail(security, type) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_price_latest", 
            						security: security,
            						ptype: type ? type : "EOD"});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

        	if (data["error"] == "" && data["latestDetail"]) {
			    resolve(data["latestDetail"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error in computing stock latest detail", errorCode: 2101}));
		    }
	    });
    })
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
			return exports.computeStockPerformance(sec)
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

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"update_realtime_prices", 
            					filename: fname,
            					type: type});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			
        	if (data["error"] == "") {
			    resolve(data["success"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error updating realtime prices", errorCode: 2101}));
		    }
	    });
    })
};

