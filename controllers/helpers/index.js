/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 13:06:04
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-17 13:14:29
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const PerformanceModel = require('../../models/Marketplace/Performance');
const UserModel = require('../../models/user');
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const APIError = require('../../utils/error');
const config = require('config');
const WebSocket = require('ws'); 
const Promise = require('bluebird');
var ObjectId= require('mongoose').Types.ObjectId;

function _compareIds(x, y) {
	if(!x && !y) {
		return true;
	} else if(!x || !y) {
		return false;
	} else {
		return x.equals(y);
	}
}

function _compareDates(d1, d2) {
	var t1 = new Date(d1).getTime();
	var t2 = new Date(d2).getTime();

	return (t1 < t2) ? -1 : (t1 == t2) ? 0 : 1;
}

module.exports.compareDates = function(date1, date2) {
	
	return _compareDates(date1, date2);
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

module.exports.validateAdvice = function(advice, oldAdvice, strictNetValue) {

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_advice", 
            						advice: advice,
            						lastAdvice: oldAdvice ? oldAdvice : "",
            						strictNetValue: strictNetValue ? strictNetValue : false});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);
			
        	if (data["error"] == "") {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error validating the advice", errorCode: 2101}));
		    }
	    });
    })
};

module.exports.validatePortfolio = function(portfolio) {

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_portfolio", 
            						portfolio: portfolio});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

		    if (data["error"] == "") {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Unknown error in validating portfolio", errorCode: 2101}));
		    }
	    });
    })
};

module.exports.validateTransactions = function(transactions, advicePortfolio, investorPortfolio) {

	//Addding a checking for valid transaction date (05-03-2018)
	var tomorrow = exports.getDate(new Date());
	tomorrow.setDate(tomorrow.getDate()+1);
	transactions.forEach(transaction => {
		if (_compareDates(transaction.date, tomorrow) != -1) {
			APIError.throwJsonError({message: "Illegal Transactions. Transactions later than today are not allowed", errorCode: 1410});
		}
	});

	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"validate_transactions", 
            						transactions: transactions,
        							advicePortfolio: advicePortfolio ? advicePortfolio : "",
        							investorPortfolio: investorPortfolio ? investorPortfolio : ""});

         	wsClient.send(msg);
        });

        wsClient.on('message', function(msg) {
        	var data = JSON.parse(msg);

		    if (data["error"] == "" && data["valid"]) {
			    resolve(data["valid"]);
		    } else if (data["error"] != "") {
		    	reject(APIError.jsonError({message: data["error"], errorCode: 2102}));
		    } else {
		    	reject(APIError.jsonError({message: "Internal error in validating transactions", errorCode: 2101}));
		    }
	    });
    })
};

module.exports.updateStockStaticPerformanceDetail = function(q, security) {
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
    })
    .then(performance => {
    	return SecurityPerformanceModel.updateStaticPerformance(q, performance);
    });
};

module.exports.updateStockRollingPerformanceDetail = function(q, security) {
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
    })
    .then(performance => {
    	return SecurityPerformanceModel.updateRollingPerformance(q, performance);
    })
};

module.exports.updateStockPriceHistory = function(q, security) {
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
    })
    .then(priceHistory => {
    	if(priceHistory) {	
    		return SecurityPerformanceModel.updatePriceHistory(q, priceHistory);
		} else {
			APIError.throwJsonError({message: "Uanble to update. Invalid price history data provided"});
		}
    });
};

module.exports.updateStockLatestDetail = function(q, security) {
	return new Promise((resolve, reject) => {

		var connection = 'ws://' + config.get('julia_server_host') + ":" + config.get('julia_server_port');
		var wsClient = new WebSocket(connection);

		wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(connection);
            var msg = JSON.stringify({action:"compute_stock_price_latest", 
            						security: security});

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
    .then(latestDetail => {
    	return SecurityPerformanceModel.updateLatestDetail(q, latestDetail);
    });
};

module.exports.getDate = function(dateTime) {
	return new Date(dateTime.toDateString());
};

module.exports.getAdminAdvisors = function() {
	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {fields:'_id'})
	.then(users => {
		if(users) {
			var userIds = users.map(item => item._id); 
			return AdvisorModel.fetchAdvisors({user:{$in: userIds}}, {fields: '_id'});
		} else {
			return [];
		}
	});
};

module.exports.getAdminAdvisor = function(userId) {
	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {fields:'_id'})
	.then(users => {
		if(users && users.map(item => item._id.toString()).indexOf(userId.toString()) != -1) {
			return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'});
		} else {
			return null;
		}
	});
};

