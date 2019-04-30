const config = require('config');
var redis = require('redis');
const Promise = require('bluebird');
const _ = require('lodash');
var path = require('path');
var fs = require('fs');
var csv = require('fast-csv');

const UserModel = require('../models/user');
const AdvisorModel = require('../models/Marketplace/Advisor');
const DailyContestEntryHelper = require('../controllers/helpers/DailyContestEntry');
const RedisUtils = require('../utils/RedisUtils');
const scrapeKotak = require('../scrapers/scrapeKotak');
const scrapeMotilalOswal = require('../scrapers/scrapeMotilalOswal');
const scrapeShareKhan = require('../scrapers/scrapeShareKhan');
const scrapeEdelweiss = require('../scrapers/scrapeEdelWeiss');
const scrapeInvestmentGuru = require('../scrapers/scrapeInvestmentGuru');
const scrapeMoneyControl = require('../scrapers/scrapeMoneyControl');
const scrapeEconomicTimes = require('../scrapers/scrapeEconomicTimes');
const {userDetails} = require('../constants/scrapingUsers');

let redisClient;
const predictionsFilePath = `${path.dirname(require.main.filename)}/examples/thirdPartyPredictions.csv`

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
    .then(predictions => Promise.all([
        DailyContestEntryHelper.processThirdPartyPredictions(predictions)
            .then(predictions => DailyContestEntryHelper.filterPredictionsForToday(predictions))
            .then(predictions => DailyContestEntryHelper.ignoreNiftyBankPredictions(predictions)),
        RedisUtils.getSetDataFromRedis(getRedisClient(), `${redisEnvironment}_${source}_prediction`, 0, -1)
    ]))
	.then(([predictions, redisPredictions]) => {
		redisPredictions = redisPredictions !== null ? DailyContestEntryHelper.processRedisPredictions(redisPredictions) : [];
		return Promise.map(predictions, async prediction => {
            const email = _.get(prediction, 'email', null);
            const newSource = _.get(prediction, 'source', null) || source;
            
            let newAdvisorId = advisorId;
            let newUserId = userId;
            let newRedisPredictions = redisPredictions;
            
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

                if (newSource !== null) {
                    console.log(`source_prediction ${redisEnvironment}_${newSource}_prediction`);
                    const requiredRedisPredictions = await RedisUtils.getSetDataFromRedis(getRedisClient(), `${redisEnvironment}_${newSource}_prediction`, 0, -1);
                    newRedisPredictions = requiredRedisPredictions !== null ? DailyContestEntryHelper.processRedisPredictions(requiredRedisPredictions) : [];
                }
            }

            prediction = _.omit(prediction, ['source', 'email']);

			if (!DailyContestEntryHelper.foundPredictionInRedis(prediction, newRedisPredictions)) {
				return DailyContestEntryHelper.createPrediction(_.cloneDeep(prediction), newUserId, newAdvisorId)
				.then(() => { 
                    console.log('Advisor Id ', newAdvisorId, newUserId);
                    // Should add to redis 
                    console.log(`Prediction Created ${prediction.position.security.ticker} - ${newSource}`);
                    RedisUtils.addSetDataToRedis(getRedisClient(), `${redisEnvironment}_${newSource}_prediction`, JSON.stringify(prediction));
                    writePredictionToCsv(predictionsFilePath, prediction);
                                        
                    return Promise.resolve(true);
                })
				.catch(err => {
                    console.log('Error createPrediction ', _.get(prediction, 'position.security.ticker', null), newSource, err.message);
                    
                    return Promise.resolve(true);
				})
			} else {
				console.log('Prediction Found', _.get(prediction, 'position.security.ticker', null), newSource); 
                
                return Promise.resolve(true);
			}
		})
    })
    .then(() => {
        console.log(`Created ${source}  Predictions`);
    })
    .catch(err => {
        console.log('Error createPredictionsFromThirdParty ', err.message);
    })
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


const writePredictionToCsv = (path, prediction) => {
	const csvStream = csv
		.createWriteStream({headers: true, flags: 'a'})
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
        
	const writableStream = fs.createWriteStream(path, {flags: 'a'});		
	writableStream.on("finish", function(){
		console.log("Written to file"); 
	});
	csvStream.pipe(writableStream);
	csvStream.write(convertPredictionToCsvFormat(prediction));
	csvStream.end();
}

const convertPredictionToCsvFormat = (prediction, source = '') => {
    return {
        advisor: prediction.source || source,
        ticker: prediction.position.security.ticker,
        target: prediction.target,
        stopLoss: prediction.stopLoss,
        startDate: prediction.startDate,
        endDate: prediction.endDate
    }
}