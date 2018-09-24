/*
* @Author: Shiv Chawla
* @Date:   2018-03-24 13:43:44
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-20 10:19:23
*/

'use strict';
const config = require('config');
const schedule = require('node-schedule');
const Promise = require('bluebird');
const SecurityHelper = require("../helpers/Security"); 
const PortfolioHelper = require("../helpers/Portfolio"); 
const AdviceHelper = require("../helpers/Advice"); 
const InvestorModel = require("../../models/Marketplace/Investor");
const AdviceModel = require("../../models/Marketplace/Advice");
const WatchlistModel = require("../../models/Marketplace/Watchlist");
let Client = require('ssh2-sftp-client');
let sftp = new Client();
var fs = require('fs');
var path = require("path");
const zlib = require('zlib');
const APIError = require('../../utils/error');
const WebSocket = require('ws');
const DateHelper = require('../../utils/Date');
const homeDir = require('os').homedir();
const serverPort = require('../../index').serverPort;

//Reload data as soon as (2s delay) server starts
setTimeout(function(){reloadData();}, 2000);

//Run when seconds = 10
schedule.scheduleJob(`${config.get('nse_delayinseconds')+10} * 6-13 * * 1-5`, function() {
    processLatestFiles();
});

//Reload data before ranking calculation
schedule.scheduleJob(`*/49 6-13 * * 1-5`, function() {
    reloadData();
});

var isBusy = {};

let activeDate;

// Subscription of test result
var subscribers = {portfolio: {}, 
	advice: {}, 
	stock: {}, 
	watchlist: {}
};

/*
* Get the last valid RT file available in the filesystem
*/
function _getLastValidFile(type) {
	var currentDate = new Date();
	var fileNumber = config.get('nse_maxfilecount');
	
	const monthNames = ["January", "February", "March", "April", "May", "June",
	  "July", "August", "September", "October", "November", "December"
	];

	var localUnzipFilePath = "";

	var found = false;
	var nAttempts = 0;
	var maxAttempts = config.get('nse_maxfilecount')*5;
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
				fileNumber = config.get('nse_maxfilecount');
				currentDate.setDate(currentDate.getDate() - 1);
			}
		} else {
			activeDate = DateHelper.getDate(currentDate);
			found = true;
		}
	}

	return localUnzipFilePath;
}

/*
* Get latest RT file based on the current time
*/
function _getLatestFile(type) {

	return new Promise((resolve, reject) => {
		let fileNumber;
		var currentDate = new Date();
		var isWeekend = currentDate.getDay() == 0 || currentDate.getDay() == 6;

		if (!isWeekend) {

			if (type == "mkt") {
				var dateNine15 = new Date();
				dateNine15.setUTCHours(3)
				dateNine15.setUTCMinutes(45);
				dateNine15.setUTCSeconds(0);
				var minutesPassed = Math.floor(Math.abs(currentDate - dateNine15)/1000/60);
				fileNumber = minutesPassed + 1;
				//Total number of files ~ 391 (393 - 3:32PM some times)
				//Using parameter config.get('nse_maxfilecount') to denote that
				
			} else if(type == "ind") {
				var dateEight50 = new Date();
				dateEight50.setUTCHours(3)
				dateEight50.setUTCMinutes(20);
				dateEight50.setUTCSeconds(0);
				minutesPassed = Math.floor(Math.abs(currentDate - dateEight50)/1000/60);
				fileNumber = minutesPassed + 1;
						}

			if (fileNumber > config.get('nse_maxfilecount')) {
				fileNumber = config.get('nse_maxfilecount');
			}

			const monthNames = ["January", "February", "March", "April", "May", "June",
			  "July", "August", "September", "October", "November", "December"
			];

			var month = currentDate.getMonth();
			var date = currentDate.getDate();
			date = date < 10 ? `0${date}` : date;
			var year = currentDate.getFullYear();
			var nseDateStr = `${monthNames[month]}${date}${year}`;
			var zipFileName = `${fileNumber}.${type}.gz`;
			
			var nseFilePath =`/CM30/DATA/${nseDateStr}/${zipFileName}`;

			var localPath = path.resolve(path.join(homeDir, `/rtdata/${nseDateStr}`));
			if (!fs.existsSync(localPath)) {
			    fs.mkdirSync(localPath);	
		  	}	

			var unzipFileName = `${fileNumber}.${type}`;
			localUnzipFilePath = `${localPath}/${unzipFileName}`;

			if (fs.existsSync(localUnzipFilePath)) {
				resolve(localUnzipFilePath);	
			} else {
				resolve(_getLastValidFile(type));
			}
			

	  	} else {
	  		reject(APIError.jsonError({message: "Weekend! No file can be downloaded"}));
	  	}
  	})
  	.catch(err => {
  		return _getLastValidFile(type);
  	})
}

/*
* HELPER: Request the Julia process to update the RT data
*/
function _updateData(filePath, type) {
	return Promise.resolve()
	.then(() => {
		if (filePath && filePath !="" && fs.existsSync(filePath)) {
			return SecurityHelper.updateRealtimePrices(filePath, type)
		} else {
			//console.log("Can't process realtime data. Bad filename");
			return false;
		}
	});
}

/*
Reloads the realtime data to Julia in case of backend failure/restart
*/
function reloadData() {
	return new Promise.map(["ind", "mkt"], function(type) {
		var currentDate = new Date();
		var fileSet = config.get("nse_reload_file_set").split(",").map(item => parseInt(item.trim()));
		
		const monthNames = ["January", "February", "March", "April", "May", "June",
		  "July", "August", "September", "October", "November", "December"
		];

		var localUnzipFilePath = "";
		var localPath = "";

		var firstFileNumber = fileSet[0];
		var lastFileNumber = fileSet[1];

		var foundFileNumber = firstFileNumber;

		var found = false;
		var nAttempts = 0;
		var maxAttempts = config.get('nse_maxfilecount')*5;
		
		while(!found && nAttempts++ < maxAttempts) {
			
			var month = currentDate.getMonth();
			var date = currentDate.getDate();
			date = date < 10 ? `0${date}` : date;
			var year = currentDate.getFullYear();
			var nseDateStr = `${monthNames[month]}${date}${year}`;

			localPath = path.resolve(path.join(homeDir, `/rtdata/${nseDateStr}`));
			
			var unzipFileName = `${foundFileNumber}.${type}`;
			localUnzipFilePath = `${localPath}/${unzipFileName}`;

			if (!fs.existsSync(localUnzipFilePath)) {
				foundFileNumber--;
				if (foundFileNumber == 0) {
					foundFileNumber = firstFileNumber;
					currentDate.setDate(currentDate.getDate() - 1);
				}
			} else {
				activeDate = DateHelper.getDate(currentDate);
				found = true;
			}
		}

		if (found) {
			//Here we have the folder where the fist reload file is found
			//Run a loop (from first(-5) to last file) to update the data
			var fileIndexIteratorArray = Array.from(Array(lastFileNumber + 1).keys()).slice(Math.max(foundFileNumber - 5, 1));
			
			return new Promise.mapSeries(fileIndexIteratorArray, function(fileNumber) {
				var filePath = `${localPath}/${fileNumber}.${type}`;
				return _updateData(filePath, type)
				.then(() => { 
					//Waiting for completion of the promise
					//Otherwise it tries to complete all requests in parallel
					return true;
				})
			});
		}
	});
}

/*
Processes the latest RT data file in the filesystem
*/
function processLatestFiles() {
	//console.log("In Process data")
	
	return Promise.all([
		_getLatestFile("mkt"),
		_getLatestFile("ind")
	])
	.then(([mktFile, indFile]) => {
		return Promise.all([
			_updateData(mktFile, "mkt"),
			_updateData(indFile, "ind")
		]);
	})
	.then(([s1, s2]) => {
		if (s1 && s2) {
			console.log("Successfully updated the stock prices");
			return _sendAllUpdates()
		} else {
			console.log("No Realtime files for Ind/Mkt to use");
		}
	})
	.catch(err => {
		console.log("Error downloading Realtime Data")
		console.log(err);
	});
}

//Function to subscribe WS data from backend to UI
module.exports.handleMktPlaceSubscription = function(req, res) {
    //1. Resolve the req for type of request. Get the portfolio Id/stock ticker/adviceId etc
    //2. Keep a track of response variable(res) by usedId
    //3. Keep a track of subscription status for portfolioId
    //4. Create a timer function that updates portfolio for latest price (interval driven function)
    //5. Relays portfolio data if still subscibed

    var type = req.type;


    if (type == "stock") {
    	return _handleStockSubscription(req, res);
    } else if(type == "watchlist") {
    	if (req.watchlistId) {
    		return _handleWatchlistSubscription(req, res);
		} else {
			res.send("Invalid portfolio. Subscription failed");
		}
    } else if(type == "portfolio") {
    	if (req.portfolioId) {
    		return _handlePortfolioSubscription(req, res);
		} else {
			res.send("Invalid portfolio. Subscription failed");
		}
    } else if(type == "advice") {
    	if (req.adviceId) {
    		return _handleAdviceSubscription(req, res);
		} else {
			res.send("Invalid advice. Subscription failed");
		}
    }
};

//Function to Unsubscribe WS data from backend 
module.exports.handleMktPlaceUnsubscription = function(req, res) {
    //1. Resolve the req for type of request. Get the portfolio Id/stock ticker/adviceId etc
    //2. Keep a track of response variable(res) by usedId
    //3. Keep a track of subscription status for portfolioId
    //4. Create a timer function that updates portfolio for latest price (interval driven function)
    //5. Relays portfolio data if still subscibed

    var type = req.type;

    if (type == "stock") {
		return _handleStockUnsubscription(req, res);
    } else if(type == "watchlist") {
    	if (req.watchlistId) {
    		return _handleWatchlistUnsubscription(req, res);
		} else {
			res.send("Invalid portfolio. Subscription failed");
		}
    } else if(type == "portfolio") {
    	if (req.portfolioId) {
    		return _handlePortfolioUnsubscription(req, res);
		} else {
			res.send("Invalid portfolio. Subscription failed");
		}
    } else if(type == "advice") {
    	if (req.adviceId) {
    		return _handleAdviceUnsubscription(req, res);
		} else {
			res.send("Invalid advice. Subscription failed");
		}
    }
};

/*
* Handles Advice unsubscription request
*/
function _handleAdviceUnsubscription(req, res) {
	return new Promise(resolve => {
		const adviceId = req.adviceId;
		const userId = req.userId;
		if (subscribers["advice"] && subscribers["advice"][adviceId]) {
			delete subscribers["advice"][adviceId][userId];
		}

		if (subscribers["advice"] && 
			subscribers["advice"][adviceId] &&
			Object.keys(subscribers["advice"][adviceId]).length == 0) {
			
			delete subscribers["advice"][adviceId];
		}

		resolve(true);
	});
}


/*
* Handles Portfolio unsubscription request
*/
function _handlePortfolioUnsubscription(req, res) {
	return new Promise(resolve => {
		const portfolioId = req.portfolioId;
		const userId = req.userId;
		if (subscribers["portfolio"] && subscribers["portfolio"][portfolioId]) {
			delete subscribers["portfolio"][portfolioId][userId];
		}

		if (subscribers["portfolio"] && 
			subscribers["portfolio"][portfolioId] && 
			Object.keys(subscribers["portfolio"][portfolioId]).length == 0) {
			delete subscribers["portfolio"][portfolioId];
		}

		resolve(true);
	});	
}


/*
* Handles Stock unsubscription request
*/
function _handleStockUnsubscription(req, res) {
	
	return new Promise(resolve => {
		const ticker = req.ticker;
		const userId = req.userId;

		if (!subscribers["stock"][ticker]) {
			subscribers["stock"][ticker] = {};
		}

		var stockSubscribers = subscribers["stock"][ticker];

		if (stockSubscribers) {
			var subscription = stockSubscribers[userId];

			if (subscription) {
				if (subscription.stock && !subscription.watchlistId) {
					delete stockSubscribers[userId]
				} else {
					delete stockSubscribers[userId].stock;
				}
			}

			if (Object.keys(stockSubscribers).length == 0) {
				delete subscribers["stock"][ticker]; 
			}
		}

		resolve(true);
	});
}


/*
* Handles Watchlist unsubscription request
*/
function _handleWatchlistUnsubscription(req, res) {
	const watchlistId = req.watchlistId;
	const userId = req.userId;

	return WatchlistModel.fetchWatchlist({user: userId, _id: watchlistId})
	.then(watchlist => {
		if(watchlist && watchlist.securities) {
			watchlist.securities.forEach(security => {
				var ticker = security.ticker;
				var stockSubscribers = subscribers["stock"][ticker];

				if (stockSubscribers) {
					var subscription = stockSubscribers[userId];
					if (subscription) {
						if (!subscription.stock && subscription.watchlistId) {
							delete stockSubscribers[userId]
						} else {
							delete stockSubscribers[userId].watchlistId;
						}

						if (Object.keys(stockSubscribers).length == 0) {
							delete subscribers["stock"][ticker]; 
						}
					}
				}
			});
		}

		resolve(true);	
	});
}

/*
* Handle Subscription for advice (automatically handles detail or summary based on subscription status)
* New subscription sends the data immediately and thereafter every 1 minute
*/
function _handleAdviceSubscription(req, res) {
	const adviceId = req.adviceId;
	const userId = req.userId;

	if (!subscribers["advice"][adviceId]) {
		subscribers["advice"][adviceId] = {};
	}

	var adviceSubscribers = subscribers["advice"][adviceId];

	//first check is user if authorized to view advice (detail or summary)
	return Promise.all([
		AdviceHelper.isUserAuthorizedToViewAdviceDetail(adviceId, userId),
		AdviceHelper.isUserAuthorizedToViewAdviceSummary(adviceId, userId)
	])
	.then(([detailAuthorization, summaryAuthorization]) => {
		if (detailAuthorization) {
			adviceSubscribers[userId] = {detail: true, response: res};
		} else if (summaryAuthorization) {
		 	adviceSubscribers[userId] = {detail: false, response: res};
		} else {
			APIError.jsonError({message: "Not Authorized to view advice"});
		}

		//this will send to all subscribers
		//should be improved to send only to the latest subscriber
		return _sendUpdatedAdviceOnNewData(adviceId);
	})
	.catch(err => {
		res.send(err.message)
	});
}

/*
* Handle Subscription for portfolio (automatically handles detail or summary based on subscription status)
* New subscription sends the data immediately and thereafter every 1 minute
*/
function _handlePortfolioSubscription(req, res) {
	const portfolioId = req.portfolioId;
	const userId = req.userId;
	const detail = req.detail ? req.detail : false;
	if (!subscribers["portfolio"][portfolioId]) {
		subscribers["portfolio"][portfolioId] = {};
	}

	var portfolioSubscribers = subscribers["portfolio"][portfolioId];

	//first check is user if authorized to view advice (detail or summary)
	return InvestorModel.fetchInvestor({user: userId}, {fields: 'portfolios'})
	.then(investor => {
		if (investor && investor.portfolios && investor.portfolios.map(item => item.toString()).indexOf(portfolioId) !=- 1) {
			portfolioSubscribers[userId] = {detail: detail , response: res};
		} else {
			APIError.throwJsonError({message: "Not Authorized to view portfolio"});
		}

		//this will send to all subscribers
		//should be improved to send only to the latest subscriber
		return _sendUpdatedPortfolioOnNewData(portfolioId);
	})
	.catch(err => {
		res.send(err.message)
	});
}

/*
* Handle Subscription for Watchlist 
* New subscription sends the data immediately and thereafter every 1 minute
*/
function _handleWatchlistSubscription(req, res) {
	const watchlistId = req.watchlistId;
	const userId = req.userId;

	return WatchlistModel.fetchWatchlist({user: userId, _id: watchlistId})
	.then(watchlist => {
		if(watchlist && watchlist.securities) {
			return Promise.mapSeries(watchlist.securities, function(security){
				var ticker = security.ticker;
				if (!subscribers["stock"][ticker]) {
					subscribers["stock"][ticker] = {};
				}

				var subscription = subscribers["stock"][ticker][userId];

				if (subscription) {
					subscribers["stock"][ticker][userId].response = res;
					subscribers["stock"][ticker][userId].watchlistId = watchlistId;					
				} else {
					subscribers["stock"][ticker][userId] = {response: res, watchlistId: watchlistId};
				}

				//Send immediate response back to subscriber
				resolve(_sendUpdatedSingleStockOnNewData(ticker, [subscribers["stock"][ticker][userId]]));	
			})
			.then(([]) => {
				return true;
			})
		} else {
			console.log("Invalid watchlist or no securities in watchlist");
			return true;
		}
	})
		
}

/*
* Handle Subscription for Stock data
* New subscription sends the data immediately and thereafter every 1 minute
*/
function _handleStockSubscription(req, res) {
	return new Promise(resolve => {
		const ticker = req.ticker;
		const userId = req.userId;
		if (!subscribers["stock"][ticker]) {
			subscribers["stock"][ticker] = {};
		}

		var stockSubscribers = subscribers["stock"][ticker];
		var subscription = stockSubscribers[userId];

		if (subscription) {
			stockSubscribers[userId].response = res;
			stockSubscribers[userId].stock = true;		
		} else {
			stockSubscribers[userId] = {response: res, stock: true};
		}

		//Send immediate response back to subscriber
		resolve(_sendStockUpdates(ticker, [stockSubscribers[userId]]));
	});
}


/*
* Sends the data using WS connection
*/
function _sendWSResponse(res, data, category, typeId) {
	if (res && res.readyState === WebSocket.OPEN) {
		var msg = JSON.stringify({
				type: category,
				portfolioId: category == "portfolio" ? typeId : null,
				adviceId: category == "advice" ? typeId : null,
				ticker: category == "stock" ? typeId : category == "watchlist" ? data.ticker : null,
				watchlistId: category == "watchlist" ? typeId : null,
				output: data,
				date: activeDate});

		return res.send(msg);
	} else {
		APIError.throwJsonError({message: "Websocket is not OPEN"});
	}
}

/*
* Sends the data based on type (filters the data (for summary) if required)
*/
function _onDataUpdate(typeId, data, category) {
	var subscribedUsers = subscribers[category][typeId];
	
	return Promise.map(Object.keys(subscribedUsers), function(userId) {
		var subscription = subscribedUsers[userId];

		var res = subscription.response;
		var detail = subscription.detail;

		return new Promise(resolve => {
			try{
				if (detail ) {
					resolve(_sendWSResponse(res, data, category, typeId));
				} else {
					resolve(_sendWSResponse(res, _filterData(data, category), category, typeId));
				}
			} catch(err) {
				console.log(err.message);
				resolve(true);
			}
		});
	});
}

/*
* Filters the data (in case of summary of Advice)
*/
function _filterData(data, type) {
	if (type == "portfolio") {
		return {summary: data.summary, adviceSummary: data.adviceSummary};
	} else if (type == "advice") {
		return {summary: data.summary};
	}
}

//This contains latest detail (as per time) and PnL Stats
function _addSummaryPortfolio(portfolio) {
	return new Promise(resolve => {
		if(portfolio) {
			resolve({detail: portfolio.detail, summary: portfolio.pnlStats, adviceSummary: portfolio.advicePerformance}); 
		} else {
			resolve({detail: null, summary: null, adviceSummary: null});
		}
	});
}

function _computeNavAndPnLChanges(oldNav, nav, oldPnl, pnl) {
	var dailyNavChange = Number((nav - oldNav).toFixed(2));
	var dailyNavChangePct = oldNav > 0.0 ? Number((dailyNavChange/oldNav).toFixed(4)) : 0.0;

	var dailyPnlChange = Number((pnl - oldPnl).toFixed(2));

	return {dailyNavChange: dailyNavChange, dailyNavChangePct: dailyNavChangePct,
			dailyPnlChange: dailyPnlChange};
}

function __getLatestPortfolioData(portfolioId, options) {
	return Promise.all([
		PortfolioHelper.getUpdatedPortfolioForEverything(portfolioId, options),
		PortfolioHelper.getUpdatedPortfolioForEverything(portfolioId, Object.assign({priceType: 'EOD'}, options))
	])
	.then(([rtPortfolio, edPortfolio]) => {
		return Promise.all([
			_addSummaryPortfolio(rtPortfolio),
			_addSummaryPortfolio(edPortfolio)
		])
	})
	.then(([rtEnhanced, edEnhanced]) => {
		var oldNav = edEnhanced.summary.netValue;
		var nav = rtEnhanced.summary.netValue;
		var oldPnl = edEnhanced.summary.totalPnl;
		var pnl = rtEnhanced.summary.totalPnl;
		
		rtEnhanced.summary = Object.assign(rtEnhanced.summary, _computeNavAndPnLChanges(oldNav, nav, oldPnl, pnl));
		
		if (rtEnhanced.adviceSummary && edEnhanced.adviceSummary) {
			rtEnhanced.adviceSummary.map(item => {
				var idx = edEnhanced.adviceSummary.map(itemX => itemX.adviceId).indexOf(item.adviceId);
				
				var oldNav = edEnhanced.adviceSummary[idx].personal.netValue;
				var nav = item.personal.netValue;
				var oldPnl = edEnhanced.adviceSummary[idx].personal.totalPnl;
				var pnl = item.personal.totalPnl;

				item = Object.assign(item, _computeNavAndPnLChanges(oldNav, nav, oldPnl, pnl));
				return item; 
			});
		}


		//Also, add lastPriceEOD in RT portfolio update
		rtEnhanced.detail.positions.map(pos => {
			var eodPosIdx = edEnhanced.detail.positions.findIndex(item => item.security.ticker === pos.security.ticker);		
			
			if(eodPosIdx != -1) {
				pos.lastPriceEOD = edEnhanced.detail.positions[eodPosIdx].lastPrice;
			}

		 	return pos;
		});

		return rtEnhanced;
	})
}

/*
* Sends all updates (STOCK/PORTFOLIO/ADVICE) to all subscribers
*/
function _sendAllUpdates() {
	return Promise.all([
		_sendUpdatedPortfoliosOnNewData(),
		_sendUpdatedAdvicesOnNewData(),
		_sendUpdatedStocksOnNewData()
	]);
}

/*
* Sends only SINGLE PORTFOLIO updates to all subscribers
*/
function _sendUpdatedPortfolioOnNewData(portfolioId) {
	return __getLatestPortfolioData(portfolioId)
	.then(enhancedPortfolio => {
		return enhancedPortfolio ? _onDataUpdate(portfolioId, enhancedPortfolio, "portfolio") : null;
	})	
}

/*
* Sends ALL PORTFOLIO updates to all subscribers
*/
function _sendUpdatedPortfoliosOnNewData() {
	var subscribedPortfolios = Object.keys(subscribers["portfolio"]);
	return Promise.mapSeries(subscribedPortfolios, function(portfolioId) {
		//USE a different function to fetch portfolio with rt prices
		//Alos, we need to add SUMMARY field in portfolio to get 
		//1. NAV 
		//2. Daily PnL (and Daily Change %)
		//3. Unrealized PnL

		return _sendUpdatedPortfolioOnNewData(portfolioId);
		
	});
}

/*
* Sends only SINGLE ADVICE updates to all subscribers
*/
function _sendUpdatedAdviceOnNewData(adviceId) {

	//USE a different function to fetch portfolio with rt prices
	return AdviceModel.fetchAdvice({_id: adviceId}, {fields: 'portfolio'})
	.then(advice => {
		if (advice && advice.portfolio) {
			return __getLatestPortfolioData(advice.portfolio, {advice:true});
		} else {
			return null;
		}
	})
	.then(enhancedPortfolio => {
		return enhancedPortfolio ? _onDataUpdate(adviceId, enhancedPortfolio, "advice") : null;
	});
}

/*
* Sends ALL ADVICE updates to all subscribers
*/
function _sendUpdatedAdvicesOnNewData() {
	var subscribedAdvices = Object.keys(subscribers["advice"]);

	return Promise.mapSeries(subscribedAdvices, function(adviceId) {
		//USE a different function to fetch portfolio with rt prices
		return _sendUpdatedAdviceOnNewData(adviceId);
	}); 
}

/*
* Sends only SINGLE STOCK updates to defined list of subscribers
*/
function _sendUpdatedSingleStockOnNewData(ticker, subscriberList) {
	return _getStockLatestData(ticker)
	.then(stockData => {
		return Promise.mapSeries(Object.keys(subscriberList), function(subscriber) {
			var subscription = subscriberList[subscriber];
			if (subscription && subscription.response) {
				var res = subscription.response;
				if (subscription.stock) {
					return _sendWSResponse(res, stockData, "stock", ticker);
				}

				if (subscription.watchlistId) {
					return _sendWSResponse(res, Object.assign({ticker: ticker}, stockData), "watchlist", subscription.watchlistId);
				}
			}
		});
	});
};

/*
* Sends only ALL STOCK updates to all subscribers
*/
function _sendUpdatedStocksOnNewData() {
	var subscribedStocks = subscribers["stock"];
	return new Promise(resolve => {
		return Promise.mapSeries(Object.keys(subscribedStocks), function(ticker) {
			var stockSubscribers = subscribedStocks[ticker];
			return _sendUpdatedSingleStockOnNewData(ticker, stockSubscribers)
		})
		.then(x => {
			resolve(true);
		})
		.catch(err => {
			console.log("Error while updating stocks on new data");
			console.log(err.message);
			resolve(true);
		})
	});
}

function _getStockLatestData(ticker) {
	return SecurityHelper.getStockLatestDetail({ticker: ticker}, "RT")
	.then(latestData => {
		return latestData.latestDetail;
	})
}
