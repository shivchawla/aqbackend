/*
* @Author: Shiv Chawla
* @Date:   2018-03-24 13:43:44
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-05-09 11:25:20
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

//Run when seconds = 10
schedule.scheduleJob("5 * * * * *", function() {
    processNewData();
});

var isBusy = {};

let activeDate;

// Subscription of test result
var subscribers = {portfolio: {}, 
	advice: {"5aace6b6bc2317399f30cc90": 
		{"5803ad79d370120f19b4df85":{detail:false, response:null}}}, 
	stock: {
		"TCS": {"5803ad79d370120f19b4df85": {response: null}}, 
		"WIPRO": {"5803ad79d370120f19b4df85": {response: null}}, 
		"NIFTY_50": {"5803ad79d370120f19b4df85": {response: null}}, 
		"NIFTY_IT": {"5803ad79d370120f19b4df85": {response: null}}, 
		"NIFTY_INFRA": {"5803ad79d370120f19b4df85": {response: null}}, 
	}, 
	watchlist: {}
};

function debugConnection(str) {
	console.log(str);
}

var sftpClosed = true;

sftp.on('close', function(err) {
	console.log("SFTP - On Close event");
	console.log(err);
	sftpClosed = true;
});

sftp.on('error', function(err) {
	console.log("SFTP - On Error event");
	console.log(err);
	sftpClosed = true;
});

sftp.on('ready', function() {
	console.log("SFTP - On Ready event");
	sftpClosed = false;
});

function connectSFTP() {
	if (sftpClosed) {
		console.log("Attempting Reconnect - SFTP");
		return sftp.connect({
		    host: config.get('nse_host'),
		    port: config.get('nse_port'),
		    username: config.get('nse_user'),
		    privateKey: fs.readFileSync(path.resolve(path.join(__dirname,`./${config.get('nse_private_key')}`))),
		    //debug:debugConnection,
		    keepaliveInterval: 5000
		})
	} else {
		console.log("SFTP already connected");
		return new Promise(resolve => {
			resolve(true);
		});
	}	
}

function _getLastValidFile(type) {
	var currentDate = new Date();
	var fileNumber = 391;
	
	const monthNames = ["January", "February", "March", "April", "May", "June",
	  "July", "August", "September", "October", "November", "December"
	];

	var localUnzipFilePath = "";

	var found = false;
	var nAttempts = 0;
	var maxAttempts = 391*5;
	while(!found && nAttempts++ < maxAttempts) {
		
		var month = currentDate.getMonth();
		var date = currentDate.getDate();
		date = date < 10 ? `0${date}` : date;
		var year = currentDate.getFullYear();
		var nseDateStr = `${monthNames[month]}${date}${year}`;

		var localPath = path.resolve(path.join(__dirname, `../../Julia/rtdata/${nseDateStr}`));
		
		var unzipFileName = `${fileNumber}.${type}`;
		localUnzipFilePath = `${localPath}/${unzipFileName}`;

		if (!fs.existsSync(localUnzipFilePath)) {
			fileNumber--;
			if (fileNumber == 0) {
				fileNumber = 391;
				currentDate.setDate(currentDate.getDate() - 1);
			}
		} else {
			activeDate = DateHelper.getDate(currentDate);
			found = true;
		}
	}

	return localUnzipFilePath;
}

function _writeFile(data, file) {
	return new Promise((resolve, reject) => {
    	try {
    		var writeUnzipStream = fs.createWriteStream(file);
    		data.pipe(zlib.createUnzip()).pipe(writeUnzipStream);
    		writeUnzipStream.on('finish', () => {
			  	console.error('All writes are now complete.');
			  	resolve(true);
			});
		} catch(err) {
			reject(err);
		}
	});
}


function _downloadNSEData(type) {

	return new Promise((resolve, reject) => {
		
		let localUnzipFilePath;
		let nseFilePath;

		console.log("Starting download process now");
		
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
					//Total number of files = 391 (393 - 3:32PM some times)

					
				} else if(type == "ind") {
					var dateEight50 = new Date();
					dateEight50.setUTCHours(3)
					dateEight50.setUTCMinutes(20);
					dateEight50.setUTCSeconds(0);
					minutesPassed = Math.floor(Math.abs(currentDate - dateEight50)/1000/60);
					fileNumber = minutesPassed + 1;
							}

				if (fileNumber > 391) {
					fileNumber = 391;
				}

				activeDate = DateHelper.getDate(currentDate);
					
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

				var localPath = path.resolve(path.join(__dirname, `../../Julia/rtdata/${nseDateStr}`));
				if (!fs.existsSync(localPath)) {
				    fs.mkdirSync(localPath);	
			  	}	

				var unzipFileName = `${fileNumber}.${type}`;
				localUnzipFilePath = `${localPath}/${unzipFileName}`;

				resolve(nseFilePath);

		  	} else {
		  		reject(APIError.jsonError({message: "Weekend! No file can be downloaded"}));
		  	}
	  	})
	  	.then(nseFile => {
		   	//Check if unzip file is already downloaded
		   	return sftp.get(nseFile, false, null)
	   	})
		.then(data => {
			return !fs.existsSync(localUnzipFilePath) ? _writeFile(data, localUnzipFilePath) : true
		}) 
		.then(successMkt => {
			//console.log(localUnzipFilePath);
			resolve(localUnzipFilePath);
		})
		.catch(err => {
			//console.log(err);
		    var lastFile = _getLastValidFile(type);
		    if (lastFile == "") {
		    	console.log("No file to process");
		    	resolve("");
		    } else {
		    	console.log("Got file to process");
		    	console.log(lastFile);
		    	resolve(lastFile);
		    }
		});
	});
}

function _downloadAndUpdateData(type) {
	return _downloadNSEData(type)
	.then(localFilePath  => {
		console.log("Sending request to Julia - update realtime prices")
		if (localFilePath && localFilePath !="") {
			return SecurityHelper.updateRealtimePrices(localFilePath, type)
		} else {
			console.log("Can't process realtime data. Bad filename");
			return false;
		}
	})
}

function processNewData() {
	console.log("In Process data")
	return connectSFTP()
	.then(() => {
		console.log("Connected to SFTP Successfully");
		return Promise.all ([
			_downloadAndUpdateData("mkt"),
			_downloadAndUpdateData("ind")
		])
	})
	.then(([s1, s2]) => {
		console.log("Successfully updated the stock prices");
		return Promise.all([
			_updatePortfoliosOnNewData(),
			_updateAdvicesOnNewData(),
			_updateStockOnNewData()
		]);
	})
	.catch(err => {
		console.log("Error Processing Realtime Data")
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

function _handleAdviceSubscription(req, res) {
	const adviceId = req.adviceId;
	const userId = req.userId;

	if (!subscribers["advice"][adviceId]) {
		subscribers["advice"][adviceId] = {};
	}

	var adviceSubscribers = subscribers["advice"][adviceId];

	//first check is user if authorized to view advice (detail or summary)
	return Promise.all([
		AdviceHelper.isUserAuthorizedToViewAdviceDetail(userId, adviceId),
		AdviceHelper.isUserAuthorizedToViewAdviceSummary(userId, adviceId)
	])
	.then(([detailAuthorization, summaryAuthorization]) => {
		if (detailAuthorization) {
			adviceSubscribers[userId] = {detail: true, response: res};
		} else if (summaryAuthorization) {
		 	adviceSubscribers[userId] = {detail: false, response: res};
		} else {
			APIError.jsonError({message: "Not Authorized to view advice"});
		}

		return true;
	})
	.catch(err => {
		res.send(err.message)
	});
}

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

		return true;
	})
	.catch(err => {
		res.send(err.message)
	});
}

function _handleWatchlistSubscription(req, res) {
	const watchlistId = req.watchlistId;
	const userId = req.userId;

	return WatchlistModel.fetchWatchlist({user: userId, _id: watchlistId})
	.then(watchlist => {
		if(watchlist && watchlist.securities) {
			watchlist.securities.forEach(security => {
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

			});
		}

		return true;	
	});
}

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

		resolve(true);
	});
}

function _sendWSResponse(res, data, category, typeId) {
	try {
		if (res) {
			if (res.readyState === WebSocket.OPEN) {
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
				throw new Error("Websocket is not OPEN");
			}
		}
	} catch (err) {
		console.log(err.message);
		return err.message;
	}
}

function _onDataUpdate(typeId, data, category) {
	var subscribedUsers = subscribers[category][typeId];
	return Promise.map(Object.keys(subscribedUsers), function(userId) {
		var subscription = subscribedUsers[userId];

		var res = subscription.response;
		var detail = subscription.detail;
		if (detail ) {
			return _sendWSResponse(res, data, category, typeId);
		} else {
			return _sendWSResponse(res, _filterData(data, category), category, typeId);
		}
	});
}

function _filterData(data, type) {
	if (type == "portfolio") {
		return {summary: data.summary, adviceSummary: data.adviceSummary};
	} else if (type == "advice") {
		return {summary: data.summary};
	}
}

function _addSummaryPortfolioOLD(portfolio, lastPortfolio) {
	return new Promise(resolve => {
		if(portfolio && portfolio.detail) {
			var positions = portfolio.detail.positions ? portfolio.detail.positions : [];

			var nav = 0.0;
			var pnl = 0.0;

			positions.forEach(item => {
				nav += Number((item.quantity*item.lastPrice).toFixed(2));
				pnl += Number((item.quantity*(item.lastPrice - item.avgPrice)).toFixed(2));
			});

			nav += portfolio.detail.cash ? portfolio.detail.cash : 0.0;

			var subPositions = portfolio.detail.subPositions ? portfolio.detail.subPositions : [];
			
			var adviceSummary = null;

			if (subPositions.length > 0) {
				var uniqueAdvices = Array.from(new Set(portfolio.detail.subPositions.map(item => {return item.advice ? item.advice.toString() : ""})));	

				adviceSummary = [];

				uniqueAdvices.forEach(adviceId => {
					var subPositionsPerAdvice = subPositions.filter(item => {return (item.advice && item.advice.toString() == adviceId) || (!item.advice && adviceId == "");});
					var navAdvice = 0.0;
					var pnlAdvice = 0.0;

					subPositionsPerAdvice.forEach(item => {
						navAdvice += item.quantity * item.lastPrice;
						pnlAdvice += item.quantity * (item.lastPrice - item.avgPrice);
					});

					adviceSummary.push({adviceId: adviceId, nav: navAdvice, pnl: pnlAdvice, weightInPortfolio: nav > 0.0 ? navAdvice/nav : 0.0});
				});
			}	

			resolve({detail: portfolio.detail, summary: {nav: nav, pnl: pnl}, adviceSummary: adviceSummary}); 
		} else {
			resolve({detail: null, summary: null, adviceSummary: null});
		}
	});
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

		return rtEnhanced;
	});
}

function _updatePortfoliosOnNewData() {
	var subscribedPortfolios = Object.keys(subscribers["portfolio"]);
	return Promise.mapSeries(subscribedPortfolios, function(portfolioId) {
		//USE a different function to fetch portfolio with rt prices
		//Alos, we need to add SUMMARY field in portfolio to get 
		//1. NAV 
		//2. Daily PnL (and Daily Change %)
		//3. Unrealized PnL

		return __getLatestPortfolioData(portfolioId)
		.then(enhancedPortfolio => {
			return enhancedPortfolio ? _onDataUpdate(portfolioId, enhancedPortfolio, "portfolio") : null;
		})
	});
}

function _updateAdvicesOnNewData() {
	var subscribedAdvices = Object.keys(subscribers["advice"]);
	return Promise.mapSeries(subscribedAdvices, function(adviceId) {
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
		})
	}); 
}

function _getStockLatestData(ticker) {
	return SecurityHelper.getStockLatestDetail({ticker: ticker}, "RT")
	.then(latestData => {
		return latestData.latestDetail;
	})
}

function _updateStockOnNewData() {
	var subscribedStocks = subscribers["stock"];
	return new Promise(resolve => {
		return Promise.mapSeries(Object.keys(subscribedStocks), function(ticker) {
			var stockSubscribers = subscribedStocks[ticker];
			//IMPLEMENT THIS FUNCTION
			return _getStockLatestData(ticker)
			.then(stockData => {
				return Promise.mapSeries(Object.keys(stockSubscribers), function(subscriber) {
					var subscription = stockSubscribers[subscriber];
					if (subscription && subscription.response) {
						var res = subscription.response;
						if (subscription.stock) {
							return _sendWSResponse(res, stockData, "stock", ticker);
						}

						if (subscription.watchlistId) {
							return _sendWSResponse(res, Object.assign({ticker: ticker}, stockData), "watchlist", subscription.watchlistId);
						}
					}
				})
			})
		})
		.then(x => {
			resolve(true);
		})
		.catch(err => {
			console.log(err);
			resolve(true);
		})
	});
}
