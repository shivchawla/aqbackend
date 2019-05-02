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
    .then(predictions => {
        return Promise.all([
            DailyContestEntryHelper.processThirdPartyPredictions(predictions, false, source)
                .then(predictions => DailyContestEntryHelper.filterPredictionsForToday(predictions))
                .then(predictions => DailyContestEntryHelper.ignoreNiftyPredictions(predictions)),
            // Storing redis for the parent source
            DailyContestEntryHelper.addRawPredictionsToRedis(getRedisClient(), predictions, source)
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
