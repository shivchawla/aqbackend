const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    const predictionTextArray = predictionText.split(' ');

    // Checking for PE
    const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

    // Checking for CE
    const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;

    // Replace all commas
    predictionText = predictionText.replace(/[",]/g, "");

    // Checking for ellipsis
    const ellipsisRegExp = /(^|[^.])\.{4}(?!\.)/
    const isEllipsisFound = predictionText.search(ellipsisRegExp) > -1;

    // Checking for future
    const futureRegExp = /Fut/i
    const isFutureFound = predictionText.search(futureRegExp) > -1;

    // Checking for Exit
    const exitRegExp = /Exit/i
    const isExitFound = predictionText.search(exitRegExp) > -1;

    if (isEllipsisFound || isFutureFound || isExitFound || isPEFound || isCEFound) {
        return null;
    }

    const buyRegExp = /Buy/i
    const isBuyFound = predictionText.search(buyRegExp) > -1;

    const sellRegExp = /Sell/i
    const isSellFound = predictionText.search(sellRegExp) > -1;

    if (!isBuyFound && !isSellFound) {
        return null;
    }

    const action = isBuyFound ? 'BUY' : 'SELL';

    const targetIndex = _.findIndex(predictionTextArray, item => {
        return item.toLowerCase() === 'target' || item.toLowerCase() === 'tgt';
    });
    let target = targetIndex > -1 ? predictionTextArray[targetIndex + 1] : 0;
    target = target.split('/')[0];

    const stopLossIndex = _.findIndex(predictionTextArray, item => {
        return item.toLowerCase() === 'sl' || item.toLowerCase() === 'stoploss';
    });

    let stopLoss = 0;
    if (predictionTextArray[stopLossIndex + 1].toLowerCase() === 'above' || predictionTextArray[stopLossIndex + 1].toLowerCase() === 'below') {
        stopLoss = predictionTextArray[stopLossIndex + 2];
    } else {
        stopLoss = predictionTextArray[stopLossIndex + 1];
    }

    let symbol = null;
    let actionIndex = -2;
    if (isBuyFound) {
        const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'BUY');
        actionIndex = buyIndex;
    } else {
        const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SELL');
        actionIndex = sellIndex;
    }
    symbol = predictionTextArray[actionIndex + 1];

    const daysIndex = _.findIndex(predictionTextArray, item => (item.toUpperCase() === 'DAYS' || item.toUpperCase() === 'WEEKLY'));

    if (daysIndex > -1) {
        symbol = predictionTextArray[daysIndex + 1];
    }

    return {
        action,
        symbol,
        stopLoss,
        target,
        advisorName,
        email: userDetails.lkpSecurities.email,
        source: 'lkpSecurities'
    }
}