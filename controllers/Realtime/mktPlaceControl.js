/*
* @Author: Shiv Chawla
* @Date:   2018-03-24 13:43:44
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-30 18:17:28
*/

'use strict';
const config = require('config');
const schedule = require('node-schedule');
const Promise = require('bluebird');
const WebSocket = require('ws');
const _ = require('lodash');

const SecurityHelper = require("../helpers/Security"); 
const PortfolioHelper = require("../helpers/Portfolio"); 
const AdviceHelper = require("../helpers/Advice"); 
const InvestorModel = require("../../models/Marketplace/Investor");
const AdvisorModel = require("../../models/Marketplace/Advisor");
const AdviceModel = require("../../models/Marketplace/Advice");
const WatchlistModel = require("../../models/Marketplace/Watchlist");
const UserModel = require('../../models/user');
const APIError = require('../../utils/error');

const MAX_ERROR_COUNT = 5;

var isBusy = {};

// Subscription of test result
var subscribers = {portfolio: {}, 
	advice: {}, 
	stock: {}, 
	watchlist: {}
};


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
		const subscriberId = req.subscriberId;

		if (_.get(subscribers, `advice.${adviceId}.${userId}.${subscriberId}`, null)) {
			delete subscribers["advice"][adviceId][userId][subscriberId];
		}

		if (Object.keys(_.get(subscribers, `advice.${adviceId}`, {})).length == 0) {
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
		const subscriberId = req.subscriberId;

		if ( _.get(subscribers, `portfolio.${portfolioId}.${userId}.${subscriberId}`, null)) {
			delete subscribers["portfolio"][portfolioId][userId][subscriberId];
		}

		if (Object.keys(_.get(subscribers, `portfolio.${portfolioId}.${userId}`, {})).length == 0) {
			delete subscribers["portfolio"][portfolioId][userId];
		}

		if (Object.keys(_.get(subscribers, `portfolio.${portfolioId}`, {})).length == 0) {
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
		const subscriberId = req.subscriberId;

		if (!subscribers["stock"][ticker]) {
			subscribers["stock"][ticker] = {};
		}

		var subscription = _.get(subscribers, `stock.${ticker}.${userId}.${subscriberId}`, null)

		if (subscription) {

			if (subscription.stock && !subscription.watchlistId) {
				delete subscribers["stock"][ticker][userId][subscriberId]
			} else {
				delete subscribers["stock"][ticker][userId][subscriberId].stock
			}

			if (Object.keys(_.get(subscribers, `stock.${ticker}.${userId}`, {})) == 0) {
				delete subscribers["stock"][ticker][userId];
			}

			if (Object.keys(_.get(subscribers, `stock.${ticker}`, {})).length = 0) {
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
	const advisorId = req.advisorId;
	const userId = req.userId;
	const subscriberId = req.subscriberId;

	return UserModel.fetchUser({_id: userId}, {fields:'email'})
	.then(user => {
		const userEmail = _.get(user, 'email', null);
		const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
		
		let advisorSelection = {user: userId};
		if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
			advisorSelection = {_id: advisorId};
		}

		return AdvisorModel.fetchAdvisor(advisorSelection, {fields:'_id user'})
		.then(advisor => {
			return WatchlistModel.fetchWatchlist({user: advisor.user._id, _id: watchlistId});	
		});	
	})	
	.then(watchlist => {
		if(watchlist && watchlist.securities) {
			watchlist.securities.forEach(security => {
				var ticker = security.ticker;
				
				var subscription = _.get(subscribers, `stock.${ticker}.${userId}.${subscriberId}`, null);

				if (subscription) {
					if (!subscription.stock && subscription.watchlistId) {
						delete subscribers["stock"][ticker][userId][subscriberId];
					} else {
						delete subscribers["stock"][ticker][userId][subscriberId].watchlistId;
					}

					if (Object.keys(_.get(subscribers, `stock.${ticker}.${userId}`, {})) == 0) {
						delete subscribers["stock"][ticker][userId];
					}

					if (Object.keys(_.get(subscribers, `stock.${ticker}`, {})).length = 0) {
						delete subscribers["stock"][ticker]; 
					}
				}
			});
		}
	})
	.catch(err => {
		console.log('Error. _handleWatchlistUnsubscription ', err.message);
	})
}

/*
* Handle Subscription for advice (automatically handles detail or summary based on subscription status)
* New subscription sends the data immediately and thereafter every 1 minute
*/
function _handleAdviceSubscription(req, res) {
	const adviceId = req.adviceId;
	const userId = req.userId;
	const subscriberId = req.subscriberId;

	if (!_.get(subscribers,`advice.${adviceId}`, null)) {
		_.set(subscribers, `advice.${adviceId}`, {})
	}

	//first check is user if authorized to view advice (detail or summary)
	return Promise.all([
		AdviceHelper.isUserAuthorizedToViewAdviceDetail(adviceId, userId),
		AdviceHelper.isUserAuthorizedToViewAdviceSummary(adviceId, userId)
	])
	.then(([detailAuthorization, summaryAuthorization]) => {
		if (detailAuthorization) {
			_.set(subscribers, `advice.${adviceId}.${userId}.${subscriberId}`, {detail: true, response: res, errorCount: 0});
		} else if (summaryAuthorization) {
			_.set(subscribers, `advice.${adviceId}.${userId}.${subscriberId}`, {detail: false, response: res, errorCount: 0});
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
	const subscriberId = req.subscriberId;

	const detail = req.detail ? req.detail : false;
	
	if (!_.get(subscribers,`portfolio.${portfolioId}`, null)) {
		_.set(subscribers, `portfolio.${portfolioId}`, {})
	}


	//first check is user if authorized to view advice (detail or summary)
	return InvestorModel.fetchInvestor({user: userId}, {fields: 'portfolios'})
	.then(investor => {
		if (investor && investor.portfolios && investor.portfolios.map(item => item.toString()).indexOf(portfolioId) !=- 1) {
			_.set(subscribers, `portfolio.${portfolioId}.${userId}.${subscriberId}`, {detail: detail , response: res, errorCount: 0});

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
	const advisorId = req.advisorId;
	const userId = req.userId;
	const subscriberId = req.subscriberId;

	return UserModel.fetchUser({_id: userId}, {fields:'email'})
	.then(user => {
		const userEmail = _.get(user, 'email', null);
		const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
		
		let advisorSelection = {user: userId};
		if (advisorId !== null && (advisorId || '').trim().length > 0 && isAdmin) {
			advisorSelection = {_id: advisorId};
		}

		return AdvisorModel.fetchAdvisor(advisorSelection, {fields:'_id user'})
		.then(advisor => {
			return WatchlistModel.fetchWatchlist({user: advisor.user._id, _id: watchlistId});	
		});	
	})
	.then(watchlist => {
		if(watchlist && watchlist.securities) {
			return Promise.mapSeries(watchlist.securities, function(security) {
				var ticker = security.ticker;
				if (!_.get(subscribers, `stock.${ticker}`, null)) {
					_.set(subscribers, `stock.${ticker}`, {})
				}

				var subscription = _.get(subscribers, `stock.${ticker}.${userId}.${subscriberId}`, null);

				if (subscription) {
					subscribers["stock"][ticker][userId][subscriberId].response = res;
					subscribers["stock"][ticker][userId][subscriberId].watchlistId = watchlistId;					
				} else {
					_.set(subscribers, `stock.${ticker}.${userId}.${subscriberId}`, {response: res, watchlistId: watchlistId, errorCount: 0});
				}

				//Send immediate response back to subscriber
				return _sendUpdatedSingleStockOnNewData(ticker, subscribers["stock"][ticker][userId]);	
			})
			.then(([]) => {
				return true;
			})
		} else {
			console.log("Invalid watchlist or no securities in watchlist");
			return true;
		}
	})
	.catch(err => {
		console.log('_handleWatchlistSubscription Error --> ', err.message);
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
		const subscriberId = req.subscriberId;

		if (!_.get(subscribers, `stock.${ticker}`, null)) {
			_.set(subscribers, `stock.${ticker}`, {})
		}

		var subscription = _.get(subscribers, `stock.${ticker}.${userId}.${subscriberId}`, null)

		if (subscription) {
			subscribers["stock"][ticker][userId][subscriberId].response = res;
			subscribers["stock"][ticker][userId][subscriberId].stock = true;
		} else {
			_.set(subscribers, `stock.${ticker}.${userId}.${subscriberId}`, {response: res, stock: true, errorCount: 0});
		}

		//Send immediate response back to subscriber
		resolve(_sendUpdatedSingleStockOnNewData(ticker, subscribers["stock"][ticker][userId]));
	});
}


/*
* Sends the data using WS connection
*/
function _sendWSResponse(subscription, data, category, typeId) {
	return new Promise(resolve => {
		try {
			let res = subscription.response;

			if (res && res.readyState === WebSocket.OPEN) {
				var msg = JSON.stringify({
						type: category,
						portfolioId: category == "portfolio" ? typeId : null,
						adviceId: category == "advice" ? typeId : null,
						ticker: category == "stock" ? typeId : category == "watchlist" ? data.ticker : null,
						watchlistId: category == "watchlist" ? typeId : null,
						output: data,
						date: null});

				resolve(res.send(msg));
			} else {
				APIError.throwJsonError("Websocket is not OPEN");
			}
		} catch (err) {
				subscription.errorCount += 1;
				resolve();
		}
	})
}

/*
* Sends the data based on type (filters the data (for summary) if required)
*/
function _onDataUpdate(typeId, data, category) {
		var subscribedUsers = _.get(subscribers, `${category}.${typeId}`, {});
		
		return Promise.map(Object.keys(subscribedUsers), function(userId) {
			var subscribers = _.get(subscribedUsers, userId ,{});

			return Promise.map(Object.keys(subscribers), function(subscriberId) {
				var subscription = subscribers[subscriberId];
				
				if (subscription && subscription.errorCount < MAX_ERROR_COUNT) {
					var res = subscription.response;
					var detail = subscription.detail;

						if (detail ) {
							return _sendWSResponse(subscription, data, category, typeId);
						} else {
							return _sendWSResponse(subscription, _filterData(data, category), category, typeId);
						}
				} else {
						delete subscribers[category][typeId][userId][subscriberId];
				}
			})
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
module.exports.sendAllUpdates = function() {
	return Promise.all([
		_sendUpdatedPortfoliosOnNewData(),
		_sendUpdatedAdvicesOnNewData(),
		_sendUpdatedStocksOnNewData()
	])

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
					return _sendWSResponse(subscription, stockData, "stock", ticker);
				}

				if (subscription.watchlistId) {
					return _sendWSResponse(subscription, Object.assign({ticker: ticker}, stockData), "watchlist", subscription.watchlistId);
				}
			}
		});
	});
};

/*
* Sends only ALL STOCK updates to all subscribers
*/
function _sendUpdatedStocksOnNewData() {
	var subscribedStocks = _.get(subscribers, "stock", {});
	return new Promise(resolve => {
		return Promise.mapSeries(Object.keys(subscribedStocks), function(ticker) {
			var stockSubscribers = _.get(subscribedStocks, ticker, {});
			return Promise.map(Object.keys(stockSubscribers), function(userId) {
				return _sendUpdatedSingleStockOnNewData(ticker, stockSubscribers[userId])	
			})
			
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
	return SecurityHelper.getStockLatestDetailByType({ticker: ticker}, "RT")
	.then(latestData => {
		return latestData.latestDetail;
	})
}
