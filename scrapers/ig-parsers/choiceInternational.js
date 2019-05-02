const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    const predictionTextArray = predictionText.split(/(\s+)/).filter(item => item.trim().length > 0);
    
    // Replace all commas
    predictionText = predictionText.replace(/[",]/g, "");

    // Replace &nbsp;
    predictionText = predictionText.replace(/\u00a0/g, " ");

    // Checking for ellipsis
    const ellipsisRegExp = /(^|[^.])\.{4}(?!\.)/
    const isEllipsisFound = predictionText.search(ellipsisRegExp) > -1;

    // Checking for ellipsis
    const threeEllipsisRegExp = /(^|[^.])\.{3}(?!\.)/
    const isThreeEllipsisFound = predictionText.search(threeEllipsisRegExp) > -1;

    // Checking for future
    const futureRegExp = /Fut/i
    const isFutureFound = predictionText.search(futureRegExp) > -1;

    // Checking for PE
    const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

    // Checking for CE
    const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;

    // Checking for CALL
    const isCallFound = _.findIndex(predictionTextArray, item => item.search() === 'call') > -1;

    // Checking for Exit
    const exitRegExp = /Exit/i
    const isExitFound = predictionText.search(exitRegExp) > -1;

    // Checking for intraday
    const intradayRegExp = /INTRADAY/i;
    const intradayRefExpSpaced = /INTRA DAY/i;
    const isIntraDayFound = predictionText.search(intradayRegExp) > -1 || predictionText.search(intradayRefExpSpaced) > -1

    if (isEllipsisFound || isExitFound || isThreeEllipsisFound || isCEFound || isPEFound || isCallFound) {
        return null;
    }

    const buyRegExp = /Buy/i
    const isBuyFound = predictionText.search(buyRegExp) > -1;

    const sellRegExp = /Sell/i
    const isSellFound = predictionText.search(sellRegExp) > -1;

    // If buy or sell not found
    if (!isBuyFound && !isSellFound) {
        return null;
    }

    const action = isBuyFound ? 'BUY' : 'SELL';

    const targetIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'TGT');
    const target = targetIndex > -1 ? predictionTextArray[targetIndex + 1] : 0;

    const stopLossIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SL');
    const stopLoss = stopLossIndex > -1 ? predictionTextArray[stopLossIndex + 1] : 0;

    let symbol = null;
    if (isBuyFound) {
        const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'BUY');
        symbol = predictionTextArray[buyIndex + 1];
    } else {
        const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SELL');
        symbol = predictionTextArray[sellIndex + 1];
    }

    return {
        action,
        symbol,
        stopLoss,
        target,
        advisorName,
        horizon: isIntraDayFound ? 0 : 1, 
        email: userDetails.choiceInternational.email,
        source: 'choiceInternational',
        stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
        targetDiff: action === 'BUY' ? 0.05 : -0.05,
        shouldCalculateDiff: isFutureFound,
    }
}
