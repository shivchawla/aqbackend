const config = require('config');
var redis = require('redis');
const moment = require('moment');
const Promise = require('bluebird');
const _ = require('lodash');
var path = require('path');
var fs = require('fs');
var csv = require('fast-csv');

const UserModel = require('../models/user');
const AdvisorModel = require('../models/Marketplace/Advisor');
const DailyContestEntryHelper = require('../controllers/helpers/DailyContestEntry');
const SecurityHelper = require('../controllers/helpers/Security');
const RedisUtils = require('../utils/RedisUtils');
const scrapeKotak = require('../scrapers/scrapeKotak');
const scrapeMotilalOswal = require('../scrapers/scrapeMotilalOswal');
const scrapeShareKhan = require('../scrapers/scrapeShareKhan');
const scrapeEdelweiss = require('../scrapers/scrapeEdelWeiss');
const scrapeInvestmentGuru = require('../scrapers/scrapeInvestmentGuru');
const scrapeMoneyControl = require('../scrapers/scrapeMoneyControl'); 
const scrapeEconomicTimes = require('../scrapers/scrapeEconomicTimes');
const {
    userDetails, 
    aggregationUser, 
    zeroHorizonAggregationUser, 
    oppositeAggregationUser, 
    oppositeZeroHorizonAggregationUser,
    pnlAggUser,
    pnlZeroHorizonAggUser,
    stockMovementAggUser,
    stockMovementZeroHorizonAggUser
} = require('../constants/scrapingUsers');
const DateHelper = require('../utils/Date');

let redisClient;

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

function filterPredictionsForToday(predictions = []) {
    const dateFormat = 'YYYY-MM-DD';
    const currentDate = moment().format(dateFormat);

    return Promise.filter(predictions, prediction => {
        const predictionStartDate = _.get(prediction, 'startDate', null);

        return predictionStartDate === currentDate;
    })
}

function ignoreNiftyPredictions(predictions = []) {
    return Promise.filter(predictions, prediction => {
        const ticker = _.get(prediction, 'position.security.ticker', '');
        if (ticker == null) {
            return false;
        }
        
        if (ticker.toLowerCase() === 'niftybank' || ticker.toLowerCase() === 'banknifty' || ticker.search(/nifty/i) > -1) {
            return false;
        }

        return true;
    })
}

function searchMultipleTickers(searchArray) {
    return Promise.map(searchArray, ticker => {
        return SecurityHelper.getStockList(ticker, {universe: null, sector: null, industry: null});
    })
}

async function processThirdPartyPredictions(predictions, isReal = false, source = null) {
    return Promise.map(predictions, async prediction => {
        const dateFormat = 'YYYY-MM-DD';
        const horizon = _.get(prediction, 'horizon', isReal ? 2 : 1);
        const startDate = moment().format(dateFormat);
        const endDate = horizon === 0 
            ? startDate 
            : moment(DateHelper.getNextNonHolidayWeekday(startDate, Number(horizon))).format(dateFormat);
        
        let ticker = _.get(prediction, 'symbol', '');
        const searchKeywords = ticker.split(' ');
        let searchArray = searchKeywords.map((keyword, index) => {
            var k = []; 
            k = k.concat(searchKeywords.slice(0, index + 1)); 
            return k.join(" ");
        });

        searchArray = searchArray.reverse();
        
        let searchStockList = await searchMultipleTickers(searchArray);
        searchStockList = _.union(...searchStockList)
        
        if (searchStockList.length === 0) {
            console.log('Ticker not found ', ticker);
            return null
        } else {
            if (searchStockList.length > 1) {
                console.log('Multiple Tickers found for ', ticker);
            }
            const stock = searchStockList[0];
            const stockTicker = _.get(stock, 'detail.NSE_ID', null);
            ticker = stockTicker;
        }

        // Searching for symbol here
        const security = {
            ticker,
            securityType: 'EQ',
            country: 'IN',
            exchange: 'NSE'
        };
        const securityLatestDetail = await SecurityHelper.getStockLatestDetail(security);
        const latestPrice = _.get(securityLatestDetail, 'latestDetailRT.close', null) || _.get(securityLatestDetail, 'latestDetailRT.Close', 0);

        const action = _.get(prediction, 'action', 'BUY');
        const investmentMultiplier = action.toUpperCase() === 'BUY' ? 1 : -1;
        const investment = investmentMultiplier * 10;
        const target = _.get(prediction, 'target', 0);
        const stopLoss = _.get(prediction, 'stopLoss', 0);

        const adjustedPrediction = {
            conditionalType: 'NOW', 
            endDate,
            startDate,
            real: isReal,
            target: Number(target),
            stopLoss: Number(stopLoss),
            position: {
                avgPrice: 0,
                investment,
                quantity: 0,
                security
            },
            stopLossDiff: _.get(prediction, 'stopLossDiff', 0),
            targetDiff: _.get(prediction, 'targetDiff', 0),
            recommendedPrice: _.get(prediction, 'recommendedPrice', 0),
            shouldCalculateDiff: _.get(prediction, 'shouldCalculateDiff', false),
            email: _.get(prediction, 'email', null),
            source: _.get(prediction, 'source', null),
            initializeStopLoss: _.get(prediction, 'initializeStopLoss', false),
            latestPrice
            // When adding extra items it should also be added in omit for thirdPartyScraping Jobs
        };
        
        // console.log(`${source} - Un Formatted Prediction `, prediction);
        // console.log(`${source} - Formatted Prediction `, adjustedPrediction);

        return adjustedPrediction;
    })
    .then(predictions => filterPredictionsForToday(predictions))
    .then(predictions => ignoreNiftyPredictions(predictions))
}

function addRawPredictionsToRedis(predictions, source) {
    return new Promise(async (resolve, reject) => {
        try {
            const redisEnvironment = process.env.NODE_ENV;
            const redisKey = `${redisEnvironment}_raw_${source}_prediction`;
            const storedPredictions = await RedisUtils.getSetDataFromRedis(getRedisClient(), redisKey, 0, -1);
        
            var newPredictions = predictions.filter(prediction => {
                return !DailyContestEntryHelper.foundPredictionForAdvisor(prediction, storedPredictions, {compareTickerOnly: true});
            });

            const predictionsFilePath = `${path.dirname(require.main.filename)}/examples/${source}_predictions.csv`

            return Promise.all([
                Promise.map(newPredictions, function(prediction) {
                    return RedisUtils.addSetDataToRedis(getRedisClient(), redisKey, JSON.stringify(prediction))
                })
                //writePredictionsToCsv(predictionsFilePath, newPredictions)
            ])
            .then(([]) => {
                resolve(newPredictions)
            })

        } catch(err) {
            reject(err);
        }
    })
}

const writePredictionsToCsv = (path, predictions) => new Promise((resolve, reject) => {
    try {
        const csvStream = csv
            .createWriteStream({headers: true})
            .transform(function(row, next){
                setImmediate(function(){
                    // this should be same as the object structure
                    next(null, {
                        advisor: row.advisor, 
                        ticker: row.ticker,
                        target: row.target,
                        stopLoss: row.stopLoss,
                        startDate: row.startDate,
                        endDate: row.endDate,
                    });
                });;
            });
            
        const writableStream = fs.createWriteStream(path);        
        writableStream.on("finish", function(){
            console.log("Written to file"); 
            resolve(true);
        });
        csvStream.pipe(writableStream);
        predictions.forEach(prediction => {
            csvStream.write(convertPredictionToCsvFormat(prediction));
        })
        csvStream.end();
    } catch(err) {
        console.log('File Error ', err);
        reject(err);
    }
})

const convertPredictionToCsvFormat = (prediction, source = '') => {
    const dateFormat = 'YYYY-MM-DD';
    const horizon = _.get(prediction, 'horizon', 'NA');
    const startDate = moment().format(dateFormat);
    let ticker = _.get(prediction, 'symbol', '');
    const target = _.get(prediction, 'target', 0);
    const stopLoss = _.get(prediction, 'stopLoss', 0);
    const action = _.get(prediction, 'action', 'BUY');

    const endDate = horizon === 0 
        ? startDate 
        : moment(DateHelper.getNextNonHolidayWeekday(startDate, Number(horizon))).format(dateFormat);
    return {
        advisor: _.get(prediction, 'source', null) || source,
        ticker: ticker,
        target: target,
        stopLoss: stopLoss,
        startDate: startDate,
        endDate: endDate,
        horizon,
        action
    }
}

const getUserInfo = email => new Promise((resolve, reject) => {
    let userId = null;
    let advisorId = null;

    UserModel.fetchUser({email, disabled: false})
    .then(user => {
        user = user.toObject();
        userId = _.get(user, '_id', '').toString();

        return AdvisorModel.fetchAdvisor({user: userId, isMasterAdvisor: true}, {insert: true})
    })
    .then(advisor => {
        advisor = advisor.toObject();
        advisorId = _.get(advisor, '_id', '').toString();
        
        resolve({advisorId, userId});
    })
    .catch(() => {
        resolve(null);
    });
})

module.exports.createPredictionsFromThirdParty = function(source, ibPositions= []) {
    const redisEnvironment = process.env.NODE_ENV;
    console.log(`${source} predictions download started`);

    let userId = null;
    let advisorId = null;
    const type = source === 'kotakFundamental' ? 'fundamental' : 'technical';

    // Type is only required for kotak right now
    // Since it has fundamental and technical
    
    const requiredUserEmail = userDetails[source].email;
    let requiredPromiseRequest = null;
    switch(source) {
        case 'kotak':
            requiredPromiseRequest = scrapeKotak;
            break;
        case 'motilalOswal':
            requiredPromiseRequest = scrapeMotilalOswal
            break;
        case 'shareKhan':
            requiredPromiseRequest = scrapeShareKhan;
            break;
        case 'edelweiss':
            requiredPromiseRequest = scrapeEdelweiss;
            break;
        case 'investmentGuru':
            requiredPromiseRequest = scrapeInvestmentGuru;
            break;
        case 'moneyControl':
            requiredPromiseRequest = scrapeMoneyControl;
            break;
        case 'economicTimes':
            requiredPromiseRequest = scrapeEconomicTimes;
            break;
        default:
            requiredPromiseRequest = scrapeKotak;
            break;
    }    
    
    return UserModel.fetchUser({email: requiredUserEmail, disabled: false})
    .then(user => {
        user = user.toObject();
		userId = _.get(user, '_id', '').toString();

		return AdvisorModel.fetchAdvisor({user: userId, isMasterAdvisor: true}, {insert: true})
	})
	.then(advisor => {
        advisor = advisor.toObject();
		advisorId = _.get(advisor, '_id', '').toString();
	})
    .then(() => requiredPromiseRequest(type))
    .then(predictions => {
        return Promise.all([
            processThirdPartyPredictions(predictions, false, source)
            // Storing redis for the parent source
            // addRawPredictionsToRedis(predictions, source)
        ]);

    })
	.then(([predictions]) => {
		return Promise.map(predictions, async prediction => {
            const email = _.get(prediction, 'email', null);
            const newSource = _.get(prediction, 'source', null) || source;

            const aggUserId = _.get(aggregationUser, 'userId', null);
            const aggAdvisorId = _.get(aggregationUser, 'advisorId', null);

            const zeroAggUserId = _.get(zeroHorizonAggregationUser, 'userId', null);
            const zeroAggAdvisorId = _.get(zeroHorizonAggregationUser, 'advisorId', null);

            const oppAggUserId = _.get(oppositeAggregationUser, 'userId', null);
            const oppAggAdvisorId = _.get(oppositeAggregationUser, 'advisorId', null);

            const oppZeroHorizonAggUserId = _.get(oppositeZeroHorizonAggregationUser, 'userId', null);
            const oppZeroHorizonAggAdvisorId = _.get(oppositeZeroHorizonAggregationUser, 'advisorId', null);

            const pnlAggUserId = _.get(pnlAggUser, 'userId', null);
            const pnlAggAdvisorId = _.get(pnlAggUser, 'advisorId', null);

            const stockMovementAggUserId = _.get(stockMovementAggUser, 'userId', null);
            const stockMovementAggAdvisorId = _.get(stockMovementAggUser, 'advisorId', null);

            const pnlZeroHorizonAggUserId = _.get(pnlZeroHorizonAggUser, 'userId', null);
            const pnlZeroHorizonAggAdvisorId = _.get(pnlZeroHorizonAggUser, 'advisorId', null);

            const stockMovementZeroHorizonAggUserId = _.get(stockMovementZeroHorizonAggUser, 'userId', null);
            const stockMovementZeroHorizonAggAdvisorId = _.get(stockMovementZeroHorizonAggUser, 'advisorId', null);
            
            let newAdvisorId = advisorId;
            let newUserId = userId;
            const maxInvestmentForAggUser = 50; // Max investment for the aggregation user
            const investment = 10000; // Investing Rs 10000 in every prediction
            const stockLatestPrice = _.get(prediction, 'latestPrice', 0);
            
            // console.log('3rd Party email ', email);
            // console.log('3rd Party source ', newSource, prediction.position.security.ticker);
            const symbol = prediction.position.security.ticker;

            // Getting avgPnl for the user for the particular symbol
            let avgPnl = null;
            try {
                const symbolDailyContestStats = await DailyContestEntryHelper.getDailyContestStats(symbol, newUserId);
                avgPnl = _.get(symbolDailyContestStats, 'total.net.avgPnl', null);
                
                // Getting avgPnl for that user
                if (avgPnl == null) {
                    const pnlStats = await DailyContestEntryHelper.getDailyContestStats(null, newUserId);
                    avgPnl = _.get(pnlStats, 'total.net.avgPnl', 0);
                }
            } catch (err) {
                avgPnl = 0;
            }

            
            // If email is present in the prediction then it should created with required user's advisorId and 
            // userId obtained from the email
            if (email !== null) { 
                const thirdPartyUser = await getUserInfo(email);
                
                if (thirdPartyUser !== null) {
                    newAdvisorId = thirdPartyUser.advisorId;
                    newUserId = thirdPartyUser.userId;
                }
            }


            //Fix the original prediction for broken stoploss/target
            if (isNaN(prediction.stopLoss) || isNaN(prediction.target) || prediction.stopLoss == 0 || prediction.target == 0) {
                const investment = prediction.position.investment;
                prediction.stopLossDiff = investment > 0 ? -0.04 : 0.04;
                prediction.targetDiff = investment > 0 ? 0.02 : -0.02;
                prediction.shouldCalculateDiff = true;
            }

            
            // Original Prediction
            const adjustedAggregationPrediction = {
                ...prediction, 
                real: aggregationUser.real,
                position: {
                    ...prediction.position,
                    investment: aggregationUser.real ? 0 : 10,
                    quantity: aggregationUser.real 
                        ? DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser)
                        : 0
                }
            };

            // Original Prediction with zero horizon
            const adjustedAggregationPredictionForZeroHorizon = {
                ...prediction, 
                real: zeroHorizonAggregationUser.real,
                position: {
                    ...prediction.position,
                    investment: zeroHorizonAggregationUser.real ? 0 : prediction.position.investment,
                    quantity: zeroHorizonAggregationUser.real 
                        ? DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser)
                        : 0
                },
                targetDiff: prediction.position.investment > 0 ? 0.015 : -0.015,
                stopLossDiff: prediction.position.investment > 0 ? -0.02 : 0.02,
                shouldCalculateDiff: true,
                endDate: prediction.startDate // setting horizon as 0, i.e same start date and end date
            };

            // Inversed prediction
            const adjustedInverseAggPrediction = {
                ...prediction,
                real: oppositeAggregationUser.real,
                position: {
                    ...prediction.position,
                    investment: oppositeAggregationUser.real ? 0 : (-1 * prediction.position.investment),
                    quantity: oppositeAggregationUser.real 
                        ? (-1 * DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser))
                        : 0,
                },
                target: prediction.stopLoss,
                stopLoss: prediction.target,   
                targetDiff: prediction.stopLossDiff,
                stopLossDiff: prediction.targetDiff     
            }

            // Inversed Prediction with zero horizon
            const adjustedInverseZeroHorizonAggPrediction = {
                ...prediction,
                real: oppositeZeroHorizonAggregationUser.real,
                position: {
                    ...prediction.position,
                    investment: oppositeZeroHorizonAggregationUser.real ? 0 : (-1 * prediction.position.investment),
                    quantity: oppositeZeroHorizonAggregationUser.real 
                        ? (-1 * DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser))
                        : 0
                },
                target: prediction.stopLoss,
                stopLoss: prediction.target,
                targetDiff: prediction.position.investment > 0 ? -0.015 : 0.015,
                stopLossDiff: prediction.position.investment > 0 ? 0.02 : -0.02,
                shouldCalculateDiff: true,
                endDate: prediction.startDate // setting horizon as 0, i.e same start date and end date
            }

            // Prediction based on avgPnl
            const adjustedPnlPrediction = avgPnl >= 0 
                ?   {
                        ...prediction, 
                        real: pnlAggUser.real,
                        position: {
                            ...prediction.position,
                            investment: pnlAggUser.real ? 0 : 10,
                            quantity: pnlAggUser.real 
                                ? DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser)
                                : 0
                        },
                        targetDiff: 0.05,
                        stopLossDiff: -0.05,
                        shouldCalculateDiff: true

                    }
                :   {
                        ...prediction,
                        real: pnlAggUser.real,
                        position: {
                            ...prediction.position,
                            investment: pnlAggUser.real ? 0 : (-1 * 10),
                            quantity: pnlAggUser.real 
                                ? (-1 * DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser))
                                : 0,
                        },
                        targetDiff: -0.05,
                        stopLossDiff: 0.05,
                        shouldCalculateDiff: true
                    }

            //Same as above but with zero horizon
            const adjustedPnlZeroHorizonPrediction = avgPnl >= 0 
                ?   {
                        ...prediction, 
                        real: pnlZeroHorizonAggUser.real,
                        position: {
                            ...prediction.position,
                            investment: pnlZeroHorizonAggUser.real ? 0 : 10,
                            quantity: pnlZeroHorizonAggUser.real 
                                ? DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser)
                                : 0
                        },
                        targetDiff: 0.015,
                        stopLossDiff: -0.02,
                        shouldCalculateDiff: true,
                        endDate: prediction.startDate
                    }
                :   {
                        ...prediction,
                        real: pnlZeroHorizonAggUser.real,
                        position: {
                            ...prediction.position,
                            investment: pnlZeroHorizonAggUser.real ? 0 : (-1 * 10),
                            quantity: pnlZeroHorizonAggUser.real 
                                ? (-1 * DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestmentForAggUser))
                                : 0,
                        
                        },
                        targetDiff: -0.015,
                        stopLossDiff: 0.02,
                        shouldCalculateDiff: true,
                        endDate: prediction.startDate
                    }

            const stockMovementPrediction = await getPredictionOnStockMovement(prediction, stockMovementAggUser.real, maxInvestmentForAggUser);
            const _tsp = await getPredictionOnStockMovement(prediction, stockMovementZeroHorizonAggUser.real, maxInvestmentForAggUser, true);
            const stockMovementZeroHorizonPrediction = {
                ..._tsp,
                endDate: prediction.startDate};

            const options = {placeOrder: false, allowNegativeQty: true, ibPositions};
            
            return Promise.all([
                _createPrediction(_.cloneDeep(prediction), newUserId, newAdvisorId, options),
                _createPrediction(adjustedAggregationPrediction, aggUserId, aggAdvisorId, options),
                _createPrediction(adjustedAggregationPredictionForZeroHorizon, zeroAggUserId, zeroAggAdvisorId, options),
                _createPrediction(adjustedInverseAggPrediction, oppAggUserId, oppAggAdvisorId, options),
                _createPrediction(adjustedInverseZeroHorizonAggPrediction, oppZeroHorizonAggUserId, oppZeroHorizonAggAdvisorId, options),
                _createPrediction(adjustedPnlPrediction, pnlAggUserId, pnlAggAdvisorId, options),
                _createPrediction(adjustedPnlZeroHorizonPrediction, pnlZeroHorizonAggUserId, pnlZeroHorizonAggAdvisorId, options),
                _createPrediction(stockMovementPrediction, stockMovementAggUserId, stockMovementAggAdvisorId, options),
                _createPrediction(stockMovementZeroHorizonPrediction, stockMovementZeroHorizonAggUserId, stockMovementZeroHorizonAggAdvisorId, options)
                
            ])
           /*.then(([aggCreatedPrediction, oppositePrediction, zeroHorizonOppPrediction]) => {
                
                if (aggCreatedPrediction) {
                    console.log('Prediction created for aggregation user');
                } else {
                    console.log('Prediction not created for aggregation user. Please provide userId and advisorId for the same');
                }

                if (oppositePrediction) {
                    console.log('Opposite Predictions Created');
                }

                if (zeroHorizonOppPrediction) {
                    console.log('Zero Horizon, Opposite Predictions Created');
                }

                return Promise.resolve(true);
            })*/
            .catch(err => {
                console.log('Error createPrediction ', _.get(prediction, 'position.security.ticker', null), newSource, err.message);
                return Promise.resolve(true);
            })
		})
    })
    .then(() => {
        console.log(`Created ${source}  Predictions`);
    })
    .catch(err => {
        console.log('Error createPredictionsFromThirdParty ', err.message);
    })
}

//function to call create prediction and handle error (all above function are called irrespective of error in one promise) 
function _createPrediction(prediction, userId, advisorId, options) {
    return Promise.resolve()
    .then(() => {
        if (userId && advisorId) {
            return DailyContestEntryHelper.createPrediction(prediction, userId, advisorId, options)
        }    
    })
    .catch(err => {
        console.log('Error createPrediction ', _.get(prediction, 'position.security.ticker', null), err.message);
    })
    
}

module.exports.getAllPredictionsFromThirdParty = async function() { 
    // const currentPositions = await SecurityHelper.getCurrentIBPositions();
    const currentPositions = [];

    return Promise.mapSeries([
        exports.createPredictionsFromThirdParty('kotak', currentPositions),
        exports.createPredictionsFromThirdParty('kotakFundamental', currentPositions),
        exports.createPredictionsFromThirdParty('motilalOswal', currentPositions),
        exports.createPredictionsFromThirdParty('shareKhan', currentPositions),
        exports.createPredictionsFromThirdParty('edelweiss', currentPositions),
        exports.createPredictionsFromThirdParty('investmentGuru', currentPositions),
        exports.createPredictionsFromThirdParty('moneyControl', currentPositions),
        exports.createPredictionsFromThirdParty('economicTimes', currentPositions)
    ])
    .then(() => {
        console.log('Donwloaded All Data');
    })
    .catch(err => {
        console.log(err);
    })
}

const getPredictionOnStockMovement = async (prediction, real, maxInvestment, intraday = false) => {
    const symbol = prediction.position.security.ticker;
    const stockDetail = await SecurityHelper.getStockDetail(prediction.position.security, prediction.startDate);
    const openPrice = _.get(stockDetail, 'latestDetailRT.open', 0);
    const prevClose = _.get(stockDetail, 'latestDetailRT.previousClose', 0);
    const stockLatestPrice = _.get(stockDetail, 'latestDetailRT.close', null) || _.get(stockDetail, 'latestDetail.Close', 0);
    const investment = 10000;
    const isBuy = prediction.position.investment > 0;

    // Original Prediction
    const adjustedBuyPrediction = {
        ...prediction, 
        real,
        position: {
            ...prediction.position,
            investment: real ? 0 : 10,
            quantity: real 
                ? DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestment)
                : 0
        },
        targetDiff: intraday ? 0.015 : 0.05,
        stopLossDiff: intraday ? -0.02 : -0.05,
        shouldCalculateDiff: true,
    };

    // Inversed prediction
    const adjustedSellPrediction = {
        ...prediction,
        real,
        position: {
            ...prediction.position,
            investment: real ? 0 : -10,
            quantity: real 
                ? (-1 * DailyContestEntryHelper.getNumSharesFromInvestment(investment, stockLatestPrice, maxInvestment))
                : 0,
        },
        targetDiff: intraday ? -0.015 : -0.05,
        stopLossDiff: intraday ? 0.02 : 0.05,
        shouldCalculateDiff: true,
    };

    if (isBuy) {
        if (openPrice > prevClose) {
            return adjustedBuyPrediction;
        } else {
            return adjustedSellPrediction
        }    
    } else {
        if (openPrice < prevClose) {
            return adjustedSellPrediction;
        } else {
            return adjustedBuyPrediction
        }
    } 
    
}

const deleteRawPredictionsFromRedis = () => {
    const client = getRedisClient();
    const redisEnvironment = process.env.NODE_ENV;
    const rawPredictionRegex = new RegExp(`${redisEnvironment}_(.*)_prediction`);
    const rawPredictionKeys = [];
    client.keys('*', (err, keys) => {
        if (!err) {
            keys.map(key => {
                const success = rawPredictionRegex.test(key);
                if (success) {
                    rawPredictionKeys.push(key);
                }
            });
            client.del(rawPredictionKeys, (err, o) => {
                if (!err) {
                    console.log('Error Occured while deleting raw prediction keys', err.message);
                } else {
                    console.log('Successfully deleted the raw prediction keys');
                }
            });
        } else {
            console.log('Error occured while getting redis keys')
        }
    });
};