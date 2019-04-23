const config = require('config');
const Promise = require('bluebird');
const _ = require('lodash');

const scrapeKotak = require('../utils/scrapeKotak');
const scrapeMotilalOswal = require('../utils/scrapeMotilalOswal');
const {processThirdPartyPredictions, createPrediction} = require('../controllers/Marketplace/DailyContestService');

module.exports.createPredictionsForMotilalOswal = () => {
    console.log('Motilal Oswal predictions download started');
    const motilalOswalUser = config.get('motilalOswalUser');
    const userId = _.get(motilalOswalUser, 'userId', null);
    const advisorId = _.get(motilalOswalUser, 'advisorId', null);

    scrapeMotilalOswal()
    .then(predictions => processThirdPartyPredictions(predictions))
    .then(predictions => {
        return Promise.map(predictions, prediction => {
            return createPrediction(prediction, userId, advisorId);
        })
        .catch(err => {
            console.log('Error createPrediction ', _.get(prediction, 'position.security.ticker'), err.message);
        })
    })
    .then(() => {
        console.log('Created Motilal Oswal Predictions');
    })
}

module.exports.createPredictionsForKotak = () => {
    console.log('Kotak Securities predictions download started');
    const kotaklUser = config.get('kotaklUser');
    const userId = _.get(kotaklUser, 'userId', null);
    const advisorId = _.get(kotaklUser, 'advisorId', null);

    scrapeKotak()
    .then(predictions => processThirdPartyPredictions(predictions))
    .then(predictions => {
        return Promise.map(predictions, prediction => {
            return createPrediction(prediction, userId, advisorId);
        })
        .catch(err => {
            console.log('Error createPrediction ', err.message);
        })
    })
    .then(() => {
        console.log('Created Kotak Securities Predictions');
    })
}