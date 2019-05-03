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
const {userDetails} = require('../constants/scrapingUsers');
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

function processThirdPartyPredictions(predictions, isReal = false, source = null) {

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

        const action = _.get(prediction, 'action', 'BUY');
        const investmentMultiplier = action.toUpperCase() === 'BUY' ? 1 : -1;
        const investment = investmentMultiplier * 10;
        const target = _.get(prediction, 'target', 0);
        const stopLoss = _.get(prediction, 'stopLoss', 0);

        const adjustedPrediction = {
            conditionalType: 'NOW', 
            endDate,
            startDate,
            real: false,
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
            initializeStopLoss: _.get(prediction, 'initializeStopLoss', false) 
            // When adding extra items it should also be added in omit for thirdPartyScraping Jobs
        };
        console.log(`${source} - Un Formatted Prediction `, prediction);
        console.log(`${source} - Formatted Prediction `, adjustedPrediction);

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
                return !DailyContestEntryHelper.foundPredictionForAdvisor(prediction, storedPredictions);
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

module.exports.createPredictionsFromThirdParty = function(source) {
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
            processThirdPartyPredictions(predictions, false, source),
            // Storing redis for the parent source
            // addRawPredictionsToRedis(predictions, source)
        ]);

    })
	.then(([predictions, rawPredictions]) => {
		return Promise.map(predictions, async prediction => {
            const email = _.get(prediction, 'email', null);
            const newSource = _.get(prediction, 'source', null) || source;
            
            let newAdvisorId = advisorId;
            let newUserId = userId;
            
            console.log('3rd Party email ', email);
            console.log('3rd Party source ', newSource, prediction.position.security.ticker); 
            
            // If email is present in the prediction then it should created with required user's advisorId and 
            // userId obtained from the email
            if (email !== null) { 
                const thirdPartyUser = await getUserInfo(email);
                
                if (thirdPartyUser !== null) {
                    newAdvisorId = thirdPartyUser.advisorId;
                    newUserId = thirdPartyUser.userId;
                }
            }

            return DailyContestEntryHelper.createPrediction(_.cloneDeep(prediction), newUserId, newAdvisorId)
            .then(prediction => {
                console.log(`Prediction Created ${prediction.position.security.ticker} - ${newSource}`);
                Promise.resolve(true)
            })
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

module.exports.getAllPredictionsFromThirdParty = function() { 
    return Promise.all([
        exports.createPredictionsFromThirdParty('kotak'), 
        exports.createPredictionsFromThirdParty('kotakFundamental'),
        exports.createPredictionsFromThirdParty('motilalOswal'),
        exports.createPredictionsFromThirdParty('shareKhan'),
        exports.createPredictionsFromThirdParty('edelweiss'),
        exports.createPredictionsFromThirdParty('investmentGuru'),
        exports.createPredictionsFromThirdParty('moneyControl'),
        exports.createPredictionsFromThirdParty('economicTimes')
    ])
    .then(() => {
        console.log('Donwloaded All Data');
    })
}
