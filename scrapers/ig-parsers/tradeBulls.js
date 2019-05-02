const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    try {
        predictionText = predictionText.trim();

        // Replace all commas
        predictionText = predictionText.replace(/[",]/g, " ");

        const predictionTextArray = predictionText.split(' ');

        // Checking for PE
        const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

        // Checking for CE
        const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;
        
        // Checking for CALL
        const isCallFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'call') > -1;

        // Checking for modify
        const isModifyFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'modify') > -1;

        // Checking for BOOk
        const isBookFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'book') > -1;

        // Checking for ellipsis
        const ellipsisRegExp = /(^|[^.])\.{4}(?!\.)/
        const isEllipsisFound = predictionText.search(ellipsisRegExp) > -1;

        // Checking for future
        const futureRegExp = /Fut/i
        const isFutureFound = predictionText.search(futureRegExp) > -1;

        // Checking for intraday
    const intradayRegExp = /INTRADAY/i;
    const intradayRefExpSpaced = /INTRA DAY/i;
    const isIntraDayFound = predictionText.search(intradayRegExp) > -1 || predictionText.search(intradayRefExpSpaced) > -1

        // Checking for Exit
        const exitRegExp = /Exit/i
        const isExitFound = predictionText.search(exitRegExp) > -1;

        if (isEllipsisFound || isExitFound || isPEFound || isCEFound || isModifyFound || isBookFound || isCallFound) {
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

        const targetRegExp = /TRGT-/i;
        const targetIndex = _.findIndex(predictionTextArray, item => item.search(targetRegExp) > -1);

        let target = targetIndex > -1 ? predictionTextArray[targetIndex] : 0;
        target = target ? 0 : target.split('-')[1];

        const stopLossRegExp = /SL-/i;
        const stopLossIndex = _.findIndex(predictionTextArray, item => item.search(stopLossRegExp) > -1);

        let stopLoss = stopLossIndex > -1 ? predictionTextArray[stopLossIndex] : 0;
        stopLoss = stopLoss.split('-')[1];

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

        return {
            action,
            symbol,
            stopLoss,
            target,
            horizon: isIntraDayFound ? 0 : 1, 
            advisorName,
            email: userDetails.tradeBulls.email,
            source: 'tradeBulls',
            stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
            targetDiff: action === 'BUY' ? 0.05 : -0.05,
            shouldCalculateDiff: isFutureFound,
        }
    } catch (err) {
        return null;
    }
}