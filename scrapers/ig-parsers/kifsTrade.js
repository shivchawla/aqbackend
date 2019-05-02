const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    const predictionTextArray = predictionText.split(' ');

    // Replace all commas
    predictionText = predictionText.replace(/[",]/g, "");

    // Check for ellipsis
    const ellipsisRegExp = /(^|[^.])\.{4}(?!\.)/
    const isEllipsisFound = predictionText.search(ellipsisRegExp) > -1;

    // Check for future
    const futureRegExp = /Fut/i
    const isFutureFound = predictionText.search(futureRegExp) > -1;

    // Checking for intraday
    const intradayRegExp = /INTRADAY/i;
    const intradayRefExpSpaced = /INTRA DAY/i;
    const isIntraDayFound = predictionText.search(intradayRegExp) > -1 || predictionText.search(intradayRefExpSpaced) > -1

    // Checking for PE
    const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

    // Checking for CE
    const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;

    // Check for exit
    const exitRegExp = /Exit/i
    const isExitFound = predictionText.search(exitRegExp) > -1;

    if (isEllipsisFound || isExitFound || isPEFound || isCEFound) {
        return null;
    }

    const buyRegExp = /Buy/i
    const isBuyFound = predictionText.search(buyRegExp) > -1;

    const sellRegExp = /Sell/i
    const isSellFound = predictionText.search(sellRegExp) > -1;

    // IF buy or sell not found then it should not be added
    if (!isBuyFound && !isSellFound) {
        return null;
    }

    const action = isBuyFound ? 'BUY' : 'SELL';

    const targetIndex = _.findIndex(predictionTextArray, item => {
        return item.toLowerCase() === 'target' || item.toLowerCase() === 'tgt';
    });
    const target = targetIndex > -1 ? predictionTextArray[targetIndex + 1] : 0;

    const stopLossIndex = _.findIndex(predictionTextArray, item => {
        return item.toLowerCase() === 'sl' || item.toLowerCase() === 'stoploss';
    });
    const stopLoss = stopLossIndex > -1 ? predictionTextArray[stopLossIndex + 1] : 0;

    // If symbol is CASTROL IND then the second element is not cmp or near therefore those two items should be added
    // Else only the first word gets added
    let symbol = null;
    let actionIndex = -2;
    if (isBuyFound) {
        const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'BUY');
        actionIndex = buyIndex;
    } else {
        const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SELL');
        actionIndex = sellIndex;
    }
    
    // The second element after buy is not "CMP" or "near" that's why it's part of the symbol
    if (predictionTextArray[actionIndex + 2].toLowerCase() !== 'cmp' && predictionTextArray[actionIndex + 2].toLowerCase() !== 'near'){
        symbol = predictionTextArray[actionIndex + 1] + predictionTextArray[actionIndex + 2];
    } else {
        symbol = predictionTextArray[actionIndex + 1];
    }

    return {
        action,
        symbol,
        stopLoss,
        target,
        horizon: isIntraDayFound ? 0 : 1, 
        advisorName,
        email: userDetails.kifsTrade.email,
        source: 'kifsTrade',
        stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
        targetDiff: action === 'BUY' ? 0.05 : -0.05,
        shouldCalculateDiff: isFutureFound,
    }
}