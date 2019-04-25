const config = require('config');
var redis = require('redis');
const Promise = require('bluebird');
const _ = require('lodash');

const UserModel = require('../models/user');
const AdvisorModel = require('../models/Marketplace/Advisor');
const DailyContestEntryHelper = require('../controllers/helpers/DailyContestEntry');
const RedisUtils = require('../utils/RedisUtils');
const scrapeKotak = require('../scrapers/scrapeKotak');
const scrapeMotilalOswal = require('../scrapers/scrapeMotilalOswal');
const scrapeShareKhan = require('../scrapers/scrapeShareKhan');
const scrapeEdelweiss = require('../scrapers/scrapeEdelWeiss');
const scrapeInvestmentGuru = require('../scrapers/scrapeInvestmentGuru');
const {userDetails} = require('../constants/scrapingUsers');

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

module.exports.getAllPredictionsFromThirdParty = function() {
    return Promise.all([
        exports.createPredictionsFromThirdParty('kotak'),
        exports.createPredictionsFromThirdParty('kotakFundamental'),
        exports.createPredictionsFromThirdParty('motilalOswal'),
        exports.createPredictionsFromThirdParty('shareKhan'),
        exports.createPredictionsFromThirdParty('edelweiss')
    ])
    .then(() => {
        console.log('Donwloaded All Data');
    })
}

module.exports.createPredictionsFromThirdParty = function(source) {
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
        .then(predictions => DailyContestEntryHelper.filterPredictionsForToday(predictions)),
		RedisUtils.getRangeFromRedis(getRedisClient(), `${source}_prediction`, 0, -1)
    ]))
	.then(([predictions, redisPredictions]) => {
		redisPredictions = redisPredictions !== null ? DailyContestEntryHelper.processRedisPredictions(redisPredictions) : [];

		return Promise.map(predictions, prediction => {
			if (!DailyContestEntryHelper.foundPredictionInRedis(prediction, redisPredictions)) {
				return DailyContestEntryHelper.createPrediction(_.cloneDeep(prediction), userId, advisorId)
				.then(() => {
					// Should add to redis
					RedisUtils.pushToRangeRedis(getRedisClient(), `${source}_prediction`, JSON.stringify(prediction));
				})
				.catch(err => {
					console.log('Error createPrediction ', _.get(prediction, 'position.security.ticker'), err.message);
				})
			} else {
				console.log('Prediction Found'); 
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