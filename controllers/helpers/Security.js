/*
* @Author: Shiv Chawla
* @Date:   2018-03-29 09:15:44
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-30 13:10:07
*/

'use strict';
const config = require('config');
const Promise = require('bluebird');
var redis = require('redis');
const csv = require('fast-csv');
const path = require('path');
const fs = require('fs');
const homeDir = require('os').homedir();
const _ = require('lodash');
const moment = require('moment');
const axios = require('axios');
const EventEmitter = require('events');
const downloadEmitter = new EventEmitter();

const niftyIndices = require('../../documents/indices.json');

const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const SecurityIntradayHistoryModel = require('../../models/Marketplace/SecurityIntradayHistory');
const APIError = require('../../utils/error');
const WebSocket = require('ws'); 

const DateHelper = require('../../utils/Date');
const WSHelper = require('./WSHelper');
const RedisUtils = require('../../utils/RedisUtils');
const InteractiveBroker = require('../Realtime/interactiveBroker');

var redisClient;
var redisNiftyDownloadSubscriber;

var downloadPromises = [];

let shortableSecurities = [];
let notAllowedForTradeSecurities = Object.values(niftyIndices);

function getRedisClient() {
	if (!redisClient || !redisClient.connected) {
		var redisPwd = config.get('node_redis_pass');

		if (redisPwd != "") {
        	redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: redisPwd});
    	} else {
    		redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'));
    	}
    }

    return redisClient; 
}

const downloadingNiftyIndicesFinishedChannel = `downloadingNiftyIndicesFinished_${process.env.NODE_ENV}`;
const downloadingNiftyIndicesErrorChannel = `downloadingNiftyIndicesError_${process.env.NODE_ENV}`;
const downloadingNiftyIndicesCount = `downloadingNiftyIndices_${process.env.NODE_ENV}`;

/*
* Setup subscriber to handle download finish/error messgae and resolve all pending promises
*/
if (!redisNiftyDownloadSubscriber || !redisNiftyDownloadSubscriber.connected) {
	var redisPwd = config.get('node_redis_pass');

	if (redisPwd != "") {
    	redisNiftyDownloadSubscriber = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: redisPwd});
	} else {
		redisNiftyDownloadSubscriber = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'));
	}
}

redisNiftyDownloadSubscriber.on('ready', function() {
	RedisUtils.subscribe(redisNiftyDownloadSubscriber, downloadingNiftyIndicesFinishedChannel);
	RedisUtils.subscribe(redisNiftyDownloadSubscriber, downloadingNiftyIndicesErrorChannel);
}); 

redisNiftyDownloadSubscriber.on('message', function(channel, message) {
	if (channel == downloadingNiftyIndicesFinishedChannel) {
		return Promise.mapSeries(downloadPromises.splice(0, downloadPromises.length), function(dp) {
			dp.resolve();
		})
	}

	if (channel == downloadingNiftyIndicesErrorChannel) {
		return Promise.mapSeries(downloadPromises.splice(0, downloadPromises.length), function(dp) {
			dp.reject(JSON.parse(message));
		})
	}
}); 

function _getRawStockList(fname) {
	return new Promise(resolve => {
		let universeList = [];
		if (fs.existsSync(fname)){
			csv.fromPath(fname, {headers:true})
		    .on("data", function(data){
		        universeList.push(data.Symbol);
		    })
		    .on("end", function(){
		        resolve(universeList);
		    })
		    .on("error" , function(err) {
		    	resolve([]);
		    });
		} else {
			resolve([]);
		}
	});
}

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

function _computeStockPriceHistory(security, field) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_price_history", 
            						security: security,
            						field: !field ? "Close" : field});
         	
     	WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

function _computeStockAtr(security, date = null, horizon = 10) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_atr", 
            						security: security,
            						date: DateHelper.getDate(date),
            						horizon: horizon});
         	
     	WSHelper.handleMktRequest(msg, resolve, reject);

    });
};


function _computeStockLatestEODDetail(security) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_price_latest", 
            						security: security,
            						ptype: "EOD"});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

/*
* Function to get latest EOD price for security
*/
function _computeStockEODDetail(security, date) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_price_historical", 
            						security: security,
            						date: date});

		WSHelper.handleMktRequest(msg, resolve, reject);

    });
};

function _computeStockIntradayHistory_OLD(security, date) {
	//FETCHES FROK JULIA
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_stock_intraday_history", 
            						security: security,
            						date: DateHelper.getDate(date)
								});
								
		WSHelper.handleMktRequest(msg, resolve, reject);
    });
}

function _computeStockIntradayHistory(security, date) {
	
	return new Promise((resolve, reject) => {

		var activeTradingDate = DateHelper.getMarketCloseDateTime(DateHelper.getPreviousNonHolidayWeekday(null, 0));
		var redisSetKey = `RtData_IB_${activeTradingDate.utc().format("YYYY-MM-DDTHH:mm:ss[Z]")}_${security.ticker}`;
		var nextMarketOpen = DateHelper.getMarketOpenDateTime(DateHelper.getNextNonHolidayWeekday(date));

		//Get compelete data from IB
		// Can't fetch index data from IB (contact customer support)
		var isIndex = security.ticker.includes("NIFTY");

		Promise.resolve()
		.then(() => {
			//Check if current time is after asked market open (in order to fetch correct data)
			//Data fetched before market open belongs to data from last day
			if (moment().isAfter(DateHelper.getMarketOpenDateTime(date)) && !DateHelper.isHoliday(date)) {
				
				setTimeout(function() {reject(new Error("Ib timed out"))}, 5000);

				return InteractiveBroker.requestIntradayHistoricalData(security.ticker, {isIndex})
			} else {
				return [];
			}
		})
		.then(data => {

			if (data.length > 0) {

				//Give out data in between asked date marke hours
				let mktOpen = DateHelper.getMarketOpenDateTime(date);
				let mktClose = DateHelper.getMarketCloseDateTime(date);
				
				let fData = data
				.map(item => {
					//Update the time Z format
					const convertedTime = DateHelper.convertIndianTimeInLocalTz(item.datetime, 'YYYYMMDD HH:mm:ss').add(1,'minute').startOf('minute').toISOString();
					return {...item, datetime: convertedTime};
				}) //resultant data should be after 
				.filter(item => {return !moment(item.datetime).isAfter(mktClose) && moment(item.datetime).isAfter(mktOpen);});

				let redisData = fData.map(item => {
					return JSON.stringify(item);
				});

				//Update the data in redis
				return Promise.mapSeries(redisData, function(eachData) {
					return RedisUtils.addSetDataToRedis(getRedisClient(), redisSetKey, eachData)
				})
				.then(() => {	
					//Set key expiry			  
					return RedisUtils.expireKeyInRedis(getRedisClient(), redisSetKey, Math.floor(nextMarketOpen.valueOf()/1000));
				})
				.then(() => {
					resolve(fData.sort((a,b) => {return moment(a.datetime).isBefore(b.datetime) ? -1 : 1;}));
				})
			} else {
				return RedisUtils.getSetDataFromRedis(getRedisClient(), redisSetKey)
				.then(redisSetData => {
					if (!redisSetData) {
						resolve([]);
					} else {
						resolve(redisSetData.map(item =>  JSON.parse(item)).sort((a,b) => {return moment(a.datetime).isBefore(b.datetime) ? -1 : 1}));
					}
				})
			}

		})
		.catch(err => {
			console.log(err);
			reject(err);
		});
		
    });
}

/*
* Function to get latest RT price for security
*/
function _computeStockLatestRTDetail(security) {
	return RedisUtils.getValue(getRedisClient(), `latestQuote-${security.ticker}`)
	.then(lastQuote => {
		if (lastQuote) {
			return JSON.parse(lastQuote);
		} else {
			return exports.getRealtimeQuote(security.ticker);
		}
	});
}


module.exports.getRealtimeQuote = function(ticker) {
	return new Promise(resolve => {
		var isIndex = ticker.includes("NIFTY");

		Promise.resolve()
		.then(() => {
			if (isIndex) {
				return exports.getRealtimeQuoteFromNiftyIndices(ticker);
			} else {
				return exports.getRealtimeQuoteFromEODH(ticker);	
			}
		})
		.then(latestQuote => {
			resolve(latestQuote);
		})
		.catch(err => {
			console.log(`Error getting quote from EODH/Nifty Indices: ${err.message}`);
			console.log(`Fetching data from IB: ${ticker}`);
			return exports.getRealtimeQuoteFromIB(ticker, isIndex)
			.then(ibQuote => {
				console.log("Received IB Quotes");
				resolve(ibQuote);
			})
			.catch(err => {
				console.log(err.message);
				console.log("Ib backfill is not working either");
				resolve({})
			})

		})
	})
};

/*
* Function to get latest EOD or RT price for security
*/
function _computeStockLatestDetail(security, type) {
	return Promise.resolve()
	.then(() => {
		if(type == "EOD") {
			return _computeStockLatestEODDetail(security); 
		} else {
			return _computeStockLatestRTDetail(security);
		}
	});
}

function _computeStockRealtimeHistoricalDetail(security, minute) {
	return new Promise((resolve, reject) => {

		var currentDate = DateHelper.getMarketCloseDateTime().toDate();
		const monthNames = ["January", "February", "March", "April", "May", "June",
		  "July", "August", "September", "October", "November", "December"
		];

		let found = false;
		let maxAttempts = 3*400;
		let type = "mkt";
		let fileNumber = minute;
		let nAttempts = 0;

		let localUnzipFilePath;

		while(!found && nAttempts++ < maxAttempts) {
			
			var month = currentDate.getMonth();
			var date = currentDate.getDate();
			date = date < 10 ? `0${date}` : date;
			var year = currentDate.getFullYear();
			var nseDateStr = `${monthNames[month]}${date}${year}`;

			var localPath = path.resolve(path.join(homeDir, `/rtdata/${nseDateStr}`));
			
			var unzipFileName = `${fileNumber}.${type}`;
			localUnzipFilePath = `${localPath}/${unzipFileName}`;

			if (!fs.existsSync(localUnzipFilePath)) {
				fileNumber--;
				if (fileNumber == 0) {
					fileNumber = 400
					currentDate.setDate(currentDate.getDate() - 1);
				}
			} else {
				//activeDate = DateHelper.getDate(currentDate);
				found = true;
			}
		}
	
		if (found) {
			var msg = JSON.stringify({action:"compute_stock_price_realtime_historical", 
	            						security: security,
	            						fileNumber: fileNumber,
	            						path: localPath});

			WSHelper.handleMktRequest(msg, resolve, reject);
		} else {
			//Return empty object
			resolve({});
		}
    });
};

function _computeStockPerformance(security) {
	return new Promise(resolve => {
		
		Promise.all([
			_getSecurityDetail(security),
			_computeStockRollingPerformanceDetail(security)
		])
		.then(([securityDetail, rollingDetail]) => {
			var updates = {
				"security.detail": securityDetail,
				rollingPerformance: {detail:rollingDetail, updatedDate: new Date()},
			};

			resolve(updates);
		})
		.catch(err => {
			console.log(err.message);
			resolve({})
		})
	});
};

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

function _getIntradayHistory(security, date) {

	var query = {'security.ticker': security.ticker,
		'security.exchange': security.exchange ? security.exchange : "NSE",
		'security.securityType': security.securityType ? security.securityType : "EQ",
		'security.country': security.country ? security.country : "IN", 
		date: DateHelper.getMarketCloseDateTime(date)};
		
	return SecurityIntradayHistoryModel.fetchHistory(query)
	.then(dbIntradayHistory => {

		var updateRequired = !dbIntradayHistory;

		var eod = DateHelper.getMarketCloseDateTime(date);

		if (!updateRequired) {
			var ts = _.get(dbIntradayHistory, 'history', []).map(item => _.get(item, 'datetime', null)).slice(-1);

			var dt20MinsAgo = moment().subtract(20, 'minutes')

			var compareWithDate = dt20MinsAgo.isBefore(moment(eod)) ? dt20MinsAgo : moment(eod);
			updateRequired = !ts || ts.length == 0 || moment(ts[0]).add(1, 'minutes').startOf('minute').isBefore(compareWithDate);

		}

		if (updateRequired) {
			return _computeStockIntradayHistory(security, date)
			.then(intradayHistory => {	
				return SecurityIntradayHistoryModel.updateHistory(query, intradayHistory, {upsert: true, new: true});
			})
		} else {
			//only unique datetime
			const uniqHistory = _.uniqBy(_.get(dbIntradayHistory, 'history', []), 'datetime');

			return {...dbIntradayHistory.toObject(), history: uniqHistory};
		}
	});	
}

function _updateLatestQuoteInRedis(ticker, latestQuote) {
	return RedisUtils.insertKeyValue(getRedisClient(), `latestQuote-${ticker}`, JSON.stringify(latestQuote))
	.then(() => {
		//Expire the real time quote
		let whenToExpire;

		if (DateHelper.isMarketTrading()) {
			whenToExpire = Math.floor(moment().endOf('minute').valueOf()/1000);
		} else {
			console.log(`Timestamp of latest/last quote for ${ticker} is ${latestQuote.datetime}`);
			whenToExpire = Math.floor(DateHelper.getMarketOpenDateTime(DateHelper.getNextNonHolidayWeekday()).valueOf()/1000);
		}
		
		return RedisUtils.expireKeyInRedis(getRedisClient(), `latestQuote-${ticker}`, whenToExpire);	
	})
}

module.exports.getNifty500Constituents = function() {
	const fname = path.resolve(path.join(__dirname, `../../documents/universe/ind_nifty500list.csv`));
	return _getRawStockList(fname);
}

//Functions to update in redis the latest quote date for multiple tickers from EODH
module.exports.updateRealtimeQuotesFromEODH = function(allTickers) {
	var activeTradingDate = DateHelper.getMarketCloseDateTime(DateHelper.getPreviousNonHolidayWeekday(null, 0));

	if (allTickers.length > 0) {
		var ticker = `${allTickers[0]}.NSE`;
		var otherTickers = allTickers.slice(1).map(item => `${item}.NSE`);

		const realtimeQuoteUrl = eval('`'+config.get('realtime_EODH_quote_url') +'`');

		return axios.get(realtimeQuoteUrl)
		.then(response => {
			if (response && response.data) {
				return response.data;
			}
		})
		.then(quotesData => {
			if (quotesData) {
				quotesData = Array.isArray(quotesData) ? quotesData : [quotesData];

				return Promise.map(quotesData, function(quoteData) { 

					var ticker = quoteData.code.split('.')[0];

					return RedisUtils.insertKeyValue(getRedisClient(), `latestQuote-${ticker}`, JSON.stringify(latestQuote))
					.then(() => {
						//Expire the real time quote
						let whenToExpire;

						if (DateHelper.isMarketTrading()) {
							whenToExpire = Math.floor(moment().endOf('minute').valueOf()/1000);
						} else {
							console.log(`Timestamp of latest/last quote for ${latestQuote.code} is ${latestQuote.timestamp}`);
							whenToExpire = Math.floor(DateHelper.getMarketOpenDateTime(DateHelper.getNextNonHolidayWeekday()).valueOf()/1000);
						}
						
						return RedisUtils.expireKeyInRedis(getRedisClient(), `latestQuote-${ticker}`, whenToExpire);	
					})
				});
			}
		})
	}
}

//Functions to update in redis the latest quote date for multiple tickers from EODH
module.exports.updateIndexRealtimeQuotesFromNifty = function() {

	return new Promise((resolve, reject) => {
		
		downloadPromises.push({resolve, reject});
		
		//Add a timeout to reject incase, it's not resolved yet;
		setTimeout(function() {
			reject(new Error("Nifty Indices download timed out!!"))
		}, 5000);

		var activeTradingDate = DateHelper.getMarketCloseDateTime(DateHelper.getPreviousNonHolidayWeekday(null, 0));
		var nextMarketOpen = DateHelper.getMarketOpenDateTime(DateHelper.getNextNonHolidayWeekday());

		var niftyUrl = 'http://iislliveblob.niftyindices.com/jsonfiles/LiveIndicesWatch.json';
		
		return RedisUtils.incValue(getRedisClient(), downloadingNiftyIndicesCount, 1)
		.then(_niftyIndicesDownloading => {
			
			if (JSON.parse(_niftyIndicesDownloading) == 1) {

				return axios.get(niftyUrl)
				.then(response => {
					if (response && response.data && response.data.data) {
						let quotesData = response.data.data
						quotesData = Array.isArray(quotesData) ? quotesData : [quotesData];

						return Promise.map(quotesData, function(latestQuote) { 
							var ticker = niftyIndices[latestQuote.indexName]; //Find the ticker 

							if (ticker) {
								latestQuote = _.pick(latestQuote, ['last', 'high', 'low', 'open', 'timeVal', 'previousClose', 'percChange']);
								let priceFields = ['last', 'high', 'low', 'open', 'previousClose'];
								let numericFields = ['last', 'high', 'low', 'open', 'previousClose', 'percChange'];

								numericFields.forEach(item => {
									if (priceFields.indexOf(item) != -1) {
										latestQuote[item] = Number(latestQuote[item].replace(',',''));
									} else {
										latestQuote[item] = Number(latestQuote[item]);
									}
								});

								latestQuote.datetime = DateHelper.convertIndianTimeInLocalTz(latestQuote.timeVal, 'mmm dd, yyyy HH:mm:ss').add(1, 'minute').startOf('minute').toISOString();
								latestQuote.change_p = Number((latestQuote.percChange/100).toFixed(4));
								latestQuote.change = Number((latestQuote.last - latestQuote.previousClose).toFixed(2));
								latestQuote.close = latestQuote.last;
								
								_.unset(latestQuote, 'percChange');
								_.unset(latestQuote, 'timeVal');
								_.unset(latestQuote, 'last');

								return _updateLatestQuoteInRedis(ticker, latestQuote);
							}
						});
					}
				})
				.then(() => {
					return RedisUtils.incValue(getRedisClient(), downloadingNiftyIndicesCount, -1)
					.then(() => {
						RedisUtils.publish(getRedisClient(), downloadingNiftyIndicesFinishedChannel, 1);
					})
				})
				.catch(err => {
					console.log(err);
					return RedisUtils.incValue(getRedisClient(), downloadingNiftyIndicesCount, -1)
					.then(() => {
						RedisUtils.publish(getRedisClient(), downloadingNiftyIndicesErrorChannel, JSON.stringify(err));
					})
				})
			} else {
				return RedisUtils.incValue(getRedisClient(), downloadingNiftyIndicesCount, -1);
			}
		})
	})
}

//IB can be used for stocks BUT NOT FOR INDEX
module.exports.getRealtimeQuoteFromIB = function(ticker, isIndex = false) {
	return new Promise((resolve, reject) => {

		setTimeout(function(){reject(new Error("IB quote timed out"))}, 5000);

		Promise.resolve()
		.then(() => {
			return Promise.all([
				InteractiveBroker.requestIntradayHistoricalData(ticker, {duration: '60 s', isIndex}),
				exports.getStockLatestDetailByType({ticker}, "EOD")
			])	
		})
		.then(([quotesData, securityDetail]) => {
			if (quotesData && quotesData.length > 0) {
				quotesData = quotesData.map(item => {
					const convertedTime = DateHelper.convertIndianTimeInLocalTz(item.datetime, 'YYYYMMDD HH:mm:ss').add(1, 'minute').startOf('minute').toISOString();
					return {...item, datetime: convertedTime};
				}).sort((a,b) => { return moment(a.datetime).isAfter(a.datetime) ? -1 : 1;});

				var latestQuote = quotesData[0];

				let ibClose = _.get(latestQuote, 'close', 0.0);
				let pClose = _.get(securityDetail, 'latestDetail.Close', 0.0);
				let change = ibClose - pClose;
				let change_p = pClose > 0 ? change/pClose : 0.0;
				latestQuote = {...latestQuote, previousClose: pClose, change, change_p};

				return _updateLatestQuoteInRedis(ticker, latestQuote)
				.then(() => {
					resolve(latestQuote)
				})
			} 
		})
		.catch(err => {
			reject(err);
		})
	})	
}

module.exports.getRealtimeQuoteFromNiftyIndices = function(ticker) {
	return exports.updateIndexRealtimeQuotesFromNifty()
	.then(() => {
		return RedisUtils.getValue(getRedisClient(), `latestQuote-${ticker}`)
	})
	.then(latestQuote => {
		return JSON.parse(latestQuote);
	})
}

module.exports.getRealtimeQuoteFromEODH = function(ticker) {
	
	return new Promise((resolve, reject) => {
		var otherTickers = '';
		
		//Add a timeout to EODH call in case EODh servers are down
		setTimeout(function() {reject(new Error("EODH quote timed out"))}, 5000);

		ticker = `${ticker}.NSE`;

		const realtimeQuoteUrl = eval('`'+config.get('realtime_EODH_quote_url') +'`');

		return axios.get(realtimeQuoteUrl)
		.then(response => {
			if (response) {
				var quoteData = response.data;
				
				//Change the timestamp format to end of minute
				quoteData.datetime = moment.unix(quoteData.timestamp).add(1, 'millisecond').startOf('minute').toISOString();
				delete quoteData.timestamp;

				return quoteData;
			}
		})
		.then(latestQuote => {
			//Update in redis
			if (latestQuote) {

				//Get the original ticker back
				ticker = latestQuote.code.split('.')[0];
				
				return _updateLatestQuoteInRedis(ticker, latestQuote)
				.then(() => {
					//return after updating redis
					resolve(latestQuote)
				});
			}
		})
		.catch(err => {
			reject(err);
		})
	})
}

module.exports.getStockPriceHistory = function(security, startDate, endDate, field="Close") {
	var query = {'security.ticker': security.ticker,
					'security.exchange': security.exchange,
					'security.securityType': security.securityType,
					'security.country': security.country};

	return SecurityPerformanceModel.fetchPriceHistory(query)
	.then(securityPerformance => {
		var update = securityPerformance ? _checkIfStockPriceHistoryUpdateRequired(securityPerformance.priceHistory) : true;
		if(update || field != "Close") {
			return _computeStockPriceHistory(security, field).then(ph => {return SecurityPerformanceModel.updatePriceHistory(query, ph);});
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

			idx =  idx !=-1 ? new Date(ph[idx].date).getTime() == new Date(endDate).getTime() ? idx : idx > 0 ? idx - 1 : idx : idx;
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

module.exports.getStockLatestDetailByType = function(security, type) {

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
				return Promise.all([
					_computeStockLatestDetail(security, type),
					_getSecurityDetail(security)
				])
				.then(([performanceDetail, securityDetail]) => {
					if (type == "EOD") {
						return SecurityPerformanceModel.updateLatestDetail(query, performanceDetail)
						.then(performance => {
							var performanceObj = performance.toObject();
							resolve(Object.assign(performanceObj.security, {latestDetail: performanceObj.latestDetail.values}));
						});
					} else {
						security.detail = securityDetail;
						resolve(Object.assign({}, security, {latestDetail: performanceDetail}));
					}
					
				});
			} else {
				var performanceObj = securityPerformance.toObject();
				resolve(Object.assign(performanceObj.security, {latestDetail: performanceObj.latestDetail.values}));
			}
		})
		.catch(err => {
			console.log(err.message);
			resolve(Object.assign({}, security, {latestDetail: {}}));
		})
	});
};

module.exports.getStockDetailEOD = function(security, date) {
	return new Promise(resolve => {
		var query = {'security.ticker': security.ticker,
						'security.exchange': security.exchange ? security.exchange : "NSE",
						'security.securityType': security.securityType ? security.securityType : "EQ",
						'security.country': security.country ? security.country : "IN"};
		
		return Promise.all([
			_computeStockEODDetail(security, date),
			_getSecurityDetail(security)
		])
		.then(([performanceDetail, securityDetail]) => {
			security.detail = securityDetail;
			resolve(Object.assign({}, security, {latestDetail: performanceDetail}));
		})
		.catch(err => {
			console.log(err.message);
			resolve(Object.assign({}, security, {latestDetail: {}}));
		})
	});
};

module.exports.getStockLatestDetail = function(security) {
	return Promise.all([
		exports.getStockLatestDetailByType(security, "EOD"),
		exports.getStockLatestDetailByType(security, "RT"),
		exports.isShortable(security),
		exports.isTradeable(security)
	])
	.then(([detailEOD, detailRT, shortable, allowed]) => {
		var rtLatestDetail = _.get(detailRT, 'latestDetail', {});
		return Object.assign(detailEOD, {latestDetailRT: rtLatestDetail, shortable, allowed});
	});
};

module.exports.getStockDetail = function(security, date) {
	var isToday = DateHelper.compareDates(date, DateHelper.getCurrentDate()) == 0;

	return Promise.all([
		isToday ? exports.getStockLatestDetailByType(security, "EOD") : exports.getStockDetailEOD(security, date),  
		isToday ? exports.getStockLatestDetailByType(security, "RT") : null
	])
	.then(([detailEOD, detailRT]) => {
		var rtLatestDetail = _.get(detailRT, 'latestDetail', {});
		return Object.assign(detailEOD, {latestDetailRT: rtLatestDetail});
	});
};

//NOT IN USE
module.exports.getRealTimeStockHistoricalDetail = function(security, minute) {
	return new Promise(resolve => {
		var query = {'security.ticker': security.ticker,
						'security.exchange': security.exchange ? security.exchange : "NSE",
						'security.securityType': security.securityType ? security.securityType : "EQ",
						'security.country': security.country ? security.country : "IN"};

		return Promise.all([
			_computeStockRealtimeHistoricalDetail(security, minute),
			_getSecurityDetail(security)
		])
		.then(([performanceDetail, securityDetail]) => {
			security.detail = securityDetail;
			resolve(Object.assign({}, security, {latestDetail: performanceDetail}));
		})
		.catch(err => {
			console.log(err.message);
			resolve(Object.assign({}, security, {latestDetail: {}}));
		})
	});
};

/*
* Function to get intraday history of stock (fetch from IB if not available)
*/
module.exports.getStockIntradayHistory = function(security, date) {

	//Get last date if date is not available
	date = moment.utc().isAfter(DateHelper.getMarketOpenDateTime(date)) && !DateHelper.isHoliday(date) ? DateHelper.getCurrentDate() : DateHelper.getPreviousNonHolidayWeekday() 

	return new Promise(resolve => {

		return Promise.all([
			_getIntradayHistory(security, date),
			_getSecurityDetail(security)
		])
		.then(([intradayDetail, securityDetail]) => {
			security.detail = securityDetail;
			resolve(Object.assign({}, security, {intradayHistory: intradayDetail.history}));
		})
		.catch(err => {
			console.log(err.message);
			resolve(Object.assign({}, security, {intradayHistory: []}));
		})
	});
};


module.exports.getStockAtr = function(security, date) {
	//Get last date if date is not available
	date = moment.utc().isAfter(DateHelper.getMarketOpenDateTime(date)) && !DateHelper.isHoliday(date) ? DateHelper.getCurrentDate() : DateHelper.getPreviousNonHolidayWeekday() 

	return new Promise(resolve => {

		return Promise.all([
			_computeStockAtr(security, date),
			_getSecurityDetail(security)
		])
		.then(([atr, securityDetail]) => {
			security.detail = securityDetail;
			resolve(Object.assign({}, security, {atr: atr}));
		})
		.catch(err => {
			console.log(err.message);
			resolve(Object.assign({}, security, {atr: null}));
		})
	});
};


//NOT IN USE
module.exports.getStockIntervalDetail = function(security, startDateTime, endDateTime) {
	var startDateEODTime = DateHelper.getMarketCloseDateTime(startDateTime);
	var isStartDateTimeBeforeMarketClose = moment(startDateTime).isBefore(startDateEODTime);
	var startDate = !isStartDateTimeBeforeMarketClose ? 
		DateHelper.getNextNonHolidayWeekday(startDateEODTime) :
		DateHelper.getDate(startDateTime);

	var endDate = DateHelper.getDate(endDateTime);

	return Promise.all([
		isStartDateTimeBeforeMarketClose ? exports.getStockIntradayHistory(security, startDate) : null,
		exports.getStockPriceHistory(security, startDate, endDate, "High"),
		exports.getStockPriceHistory(security, startDate, endDate, "Low"),
		exports.getStockIntradayHistory(security, endDate),
		_getSecurityDetail(security)
	])
	.then(([startDateIntradayDetail, eodHighHistory, eodLowHistory, endDateIntradayDetail, securityDetail]) => {
		
		security.detail = securityDetail;
		var startDateHistory = _.get(startDateIntradayDetail, 'intradayHistory', []).filter(item => {return moment(`${item.datetime}Z`).isAfter(moment(startDateTime))});
		var endDateHistory = _.get(endDateIntradayDetail, 'intradayHistory', []).filter(item => {return moment(`${item.datetime}Z`).isBefore(moment(endDateTime))});
		var lowPriceHistory =  _.get(eodLowHistory, 'priceHistory', []);
		var highPriceHistory = _.get(eodHighHistory, 'priceHistory', []);

		var intervalLowPrice = Math.min(...[
			_.get(_.minBy(startDateHistory, 'low'), 'low', 0),
			_.get(_.minBy(endDateHistory, 'low'), 'low', 0),
			_.get(_.minBy(lowPriceHistory, 'price'), 'price', 0)]);

		var intervalHighPrice = Math.max(...[
			_.get(_.maxBy(startDateHistory, 'high'), 'high', 0),
			_.get(_.maxBy(endDateHistory, 'high'), 'high', 0),
			_.get(_.maxBy(highPriceHistory, 'price'), 'price', 0)]);

		
		return {...security, intervalDetail: {high: intervalHighPrice, low: intervalLowPrice}};

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

module.exports.getShortableUniverse = function() {
	const fname_shortable = path.resolve(path.join(__dirname, `../../documents/universe/ind_nifty500list_shortable.csv`));
	return _getRawStockList(fname_shortable);
}

module.exports.getNonTradeableUniverse = function() {
	const fname_nontradeable = path.resolve(path.join(__dirname, `../../documents/universe/ind_nifty500list_nontradeable.csv`));
	return _getRawStockList(fname_nontradeable);
};

module.exports.getStockList = function(search, options) {
	const universe = options.universe;
	const sector = options.sector;
	const industry = options.industry;
	const skip = _.get(options, 'skip', 0);
	const limit = _.get(options, 'limit', 10);

	// // Update multword search key words in into array
	// var searchKeywords = search.split(" ")
	// var searchArray = searchKeywords.map((keyword, index) => {
	// 			var k = []; k = k.concat(searchKeywords.slice(0, index + 1)); return k.join(" ")
	// 		});

	const exclude = _.get(options, 'exclude', []);

	let shortableUniverseList;
	return Promise.resolve()
	.then(() => {	
		if (universe) {
			const fname = path.resolve(path.join(__dirname, `../../documents/universe/ind_${universe.replace(new RegExp("_",'g'),"").toLowerCase()}list.csv`));
			const fname_shortable = path.resolve(path.join(__dirname, `../../documents/universe/ind_nifty500list_shortable.csv`));
			
			return Promise.all([
				_getRawStockList(fname),
				_getRawStockList(fname_shortable)
			]);
		} else {
			return [[], []];
		}
	})
	.then(([universeList, sUniverseList]) => {

		//Populate stocks that can be shorted
		shortableUniverseList = sUniverseList;
		var startWithSearch = `(^${search}.*)$`; 
		var q1 = {'security.ticker': {$regex: startWithSearch, $options: "i"}};

		//CAN be improved to first match in ticker and then 
		var containsSearch = `^(.*?(${search})[^$]*)$`;
		var q21 = {'security.ticker': {$regex: containsSearch, $options: "i"}};
		var q22 = {'security.detail.Nse_Name': {$regex: containsSearch, $options: "i"}};
		
		// var q1Queries = [];
		// searchArray.forEach(searchItem => {
		// 	var startWithSearch = `(^${searchItem}.*)$`; 
		// 	q1Queries = q1Queries.concat({'security.ticker': {$regex: startWithSearch, $options: "i"}});
		// });

		// var q1 = {$or: q1Queries};

		// //CAN be improved to first match in ticker and then
		
		// var q21Queries = [];
		// var q22Queries = [];
		// searchArray.forEach(searchItem => { 
		// 	var containsSearch = `^(.*?(${searchItem})[^$]*)$`;
		// 	q21Queries = q21Queries.concat({'security.ticker': {$regex: containsSearch, $options: "i"}});
		// 	q22Queries = q22Queries.concat({'security.detail.Nse_Name': {$regex: containsSearch, $options: "i"}});
		// });

		// var q21 = {$or: q21Queries};
		// var q22 = {$or: q22Queries};

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

		let qExclude = {};

		if (exclude.length > 0) {
			qExclude = {'security.ticker' : {$nin: exclude}}
		}

	    var containsNIFTY = "^NIFTY.*$";
	    var q10 = {'security.ticker': {$regex: containsNIFTY}}; 
	    
	    var onlyStockQueries = universe || sector || industry;

	    var query_1 =  {$and: [q1, q3, q4, q5, q6, q7, q8, q9, qSector, qIndustry, qUniverse, qExclude]}; 
	    var query_21 = {$and: [q21, q3, q4, q5, q6, q7, q8, q9, qSector, qIndustry, qUniverse, qExclude]};
	    var query_22 = {$and: [q22, q3, q4, q5, q6, q7, q8, q9, qSector, qIndustry, qUniverse, qExclude]};
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

		var securitiesExactMatch = exactMatch.map(item => item.toObject().security);
		var securitiesNearMatchTicker = nearMatchTicker.map(item => item.toObject().security);
		var securitiesNearMatchName = nearMatchName.map(item => item.toObject().security);
		var securitiesNiftyExactMatch = niftyExactMatch.map(item => item.toObject().security);
		var securitiesNiftyNearMatch = niftyNearMatch.map(item => item.toObject().security);

		var totalSecurities = securitiesExactMatch.concat(securitiesNearMatchTicker).concat(securitiesNearMatchName).concat(securitiesNiftyExactMatch).concat(securitiesNiftyNearMatch);
		
		//REMOVE DUPLICATES
		totalSecurities = totalSecurities.filter((item, pos, arr) => {
				return arr.map(itemS => itemS["ticker"]).indexOf(item["ticker"])==pos;});

		//Slice the output
		totalSecurities = limit > 0 ? totalSecurities.slice(0, limit) : totalSecurities;

		//Fill shortable flag
		totalSecurities = shortableUniverseList.length > 0 ? 
			totalSecurities.map(item => {
				var shortIdx = shortableUniverseList.indexOf(item.ticker);
				if (shortIdx != -1) {
					item = Object.assign({shortable: true}, item);
				}

				return item;

			}) : totalSecurities;

		return totalSecurities;

	});
};

module.exports.updateStockList = function() {

	return exports.countSecurities()
	.then(count => {
		return exports.findSecurities("", 0);	
	})
	.then(securities => {
		return Promise.map(securities, function(security) {
			if (security.ticker != "") {
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
				
				return new Promise(resolve => {
					return _getSecurityDetail(sec)
					.then(securityDetail => {
						const updates = {'security.detail' : securityDetail};
						return SecurityPerformanceModel.updateSecurityPerformance(query, updates)
						.then(() => {
							resolve();
						})
					})
					.catch(err => {
						console.log(err);
						resolve(1);
					})
				})

			} else {
				return;
			}	
			//ADDING CONCURRENCY TO LIMIT SIMULTAENOUS EXECUTION LIMIT to 4
		}, {concurrency: 4});
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

module.exports.getIntradaySnapshot = function(fname, type) {
	return new Promise((resolve, reject) => {

		var msg = JSON.stringify({action:"compute_intraday_snapshot", 
    					filename: fname,
    					type: type});

		WSHelper.handleMktRequest(msg, resolve, reject);
    })
};

module.exports.updateIntradayHistory = function(ticker, snapShot) {

	//update to UTC format by appending Z
	snapShot.datetime = `${_.get(snapShot,'datetime', null)}Z`;

	if (datetime) {
		var date = DateHelper.getMarketCloseDateTime(DateHelper.getDate(snapShot.datetime));
		return SecurityPerformanceModel.addHistory({'security.ticker':ticker, date: date}, snapShot);		
	} else {
		console.log("Updating Intraday History: Invalid DateTime")
		return ;
	}
};

module.exports.isShortable = function(security) {
	return shortableSecurities.indexOf(security.ticker) != -1;
};

module.exports.isTradeable = function(security) {
	return notAllowedForTradeSecurities.indexOf(security.ticker) == -1;
};

module.exports.placeOrder = function(orderParams) {
	return InteractiveBroker.placeOrder(orderParams);
}

return Promise.all([
	exports.getShortableUniverse(),
	exports.getNonTradeableUniverse()
])
.then(([shortableUniverse, nonTradeableUniverse])  => {
	shortableSecurities = shortableUniverse;
	notAllowedForTradeSecurities = notAllowedForTradeSecurities.concat(nonTradeableUniverse);
})

