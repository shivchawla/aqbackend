const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    let horizon = 1;
    // Replace all commas
    predictionText = predictionText.replace(/[",]/g, "");

    const predictionTextArray = predictionText.split(' ');

    // Checking for PE
    const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

    // Checking for CE
    const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;

    // Checking for CALL
    const isCallFound = _.findIndex(predictionTextArray, item => item.search() === 'call') > -1;

    // Checking for future
    const futureRegExp = /Fut/i
    const isFutureFound = predictionText.search(futureRegExp) > -1;

    // Checking for intraday
    const intradayRegExp = /INTRADAY/i;
    const intradayRefExpSpaced = /INTRA DAY/i;
    const isIntraDayFound = predictionText.search(intradayRegExp) > -1 || predictionText.search(intradayRefExpSpaced) > -1

    if (isCEFound || isPEFound || isCallFound) {
        return null
    }

    // Getting buyIndex
    const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() == 'BUY');

    const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() == 'SELL');

    let symbol = null;
    let action = null;

    if (buyIndex > -1) {
        symbol = predictionTextArray[buyIndex + 1];
        action = 'BUY';
    } else if(sellIndex > -1) {
        symbol = predictionTextArray[sellIndex + 1];
        action = 'SELL';
    } else { // If 'BUY' and 'SELL' then prediction should not be added
        return null
    }

    // Stop Loss found  after 'SL'
    const stopLossIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() == 'SL');
    const stopLoss = predictionTextArray[stopLossIndex + 1];

    // Target found after 'T1'
    const targetIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() == 'T1');
    const target = predictionTextArray[targetIndex + 1];

    return {
        action,
        symbol,
        stopLoss,
        target,
        horizon: isIntraDayFound ? 0 : 1, 
        advisorName,
        email: userDetails.geplCapital.email,
        source: 'geplCapital',
        stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
        targetDiff: action === 'BUY' ? 0.05 : -0.05,
        shouldCalculateDiff: isFutureFound,
    }
}