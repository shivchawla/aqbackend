const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

// BUY DRREDDY(CASH) 2852, STOP LOSS 2838, TARGET 2910, 2930 (1-2 DAYS) 
// BUY CIPLA(CASH) ABOVE 572, STOP LOSS 554, TARGETS 590, 615 & 624 (3-5 DAYS)

module.exports = (predictionText, advisorName = '') => {
    // Replace all commas
    predictionText = predictionText.replace(/[",]/g, "");

    const predictionTextArray = predictionText.split(' ');

    const action = predictionTextArray[0];
    const symbol = predictionTextArray[1].split('(')[0];

    // Checking for future
    const futureRegExp = /Fut/i
    const isFutureFound = predictionText.search(futureRegExp) > -1;

    // Checking for intraday
    const intradayRegExp = /INTRADAY/i;
    const intradayRefExpSpaced = /INTRA DAY/i;
    const isIntraDayFound = predictionText.search(intradayRegExp) > -1 || predictionText.search(intradayRefExpSpaced) > -1

    // Getting Stop Loss
    const lossIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'LOSS');
    const stopLoss = lossIndex > -1 ? predictionTextArray[lossIndex + 1] : 0;

    // target can be present as TARGET or TARGETS
    let targetIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'TARGET'); 

    if (targetIndex === -1) {
        targetIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'TARGETS');
    }

    // If target is in TARGETS 248-251 format, that's why it is needed to split by '-'
    const target = predictionTextArray[targetIndex + 1].split('-')[0] || 0;

    return {
        action,
        symbol,
        stopLoss,
        target,
        horizon: isIntraDayFound ? 0 : 1, 
        advisorName,
        email: userDetails.hemSecurities.email,
        source: 'hemSecurities',
        stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
        targetDiff: action === 'BUY' ? 0.05 : -0.05,
        shouldCalculateDiff: isFutureFound,
    };
}