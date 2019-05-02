const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    try {
        // replace comma
        predictionText = predictionText.replace(/[",]/g, "");

        const predictionTextArray = predictionText.split(/(\s+)/).filter(item => item.trim().length > 0);

        // Checking for PE
        const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

        // Checking for CE
        const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;

        // Checking for CALL
        const isCallFound = _.findIndex(predictionTextArray, item => item.search() === 'call') > -1;

        const profitRegExp = /Profit/i
        // Checling for book profit
        const isProfitFound = _.findIndex(predictionTextArray, item => item.search(profitRegExp) > -1) > -1;

        // Replace all commas
        predictionText = predictionText.replace(/[",]/g, "");

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

        if (isEllipsisFound || isExitFound || isPEFound || isCEFound || isProfitFound || isCallFound) {
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

        const targetRegExp = /TARGET/i;
        const targetIndex = _.findIndex(predictionTextArray, item => item.search(targetRegExp) > -1);

        let target = predictionTextArray[targetIndex + 1].split('.')[0];

        const stopLossRegExp = /LOSS/i;
        const stopLossIndex = _.findIndex(predictionTextArray, item => item.search(stopLossRegExp) > -1);

        let stopLoss = predictionTextArray[stopLossIndex + 1].split('.')[0];

        let symbol = null;

        let actionIndex = -2;
        if (isBuyFound) {
            const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'BUY');
            actionIndex = buyIndex;
        } else {
            const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SELL');
            actionIndex = sellIndex;
        }

        let openParanthesisRegExp = /\(/i;
        let openParaIndex = _.findIndex(predictionTextArray, item => item.search(openParanthesisRegExp) > -1);
        symbol = predictionTextArray.slice(actionIndex + 1, openParaIndex).join(' ');

        return {
            action,
            symbol,
            stopLoss,
            target,
            horizon: isIntraDayFound ? 0 : 1, 
            advisorName,
            email: userDetails.ventura.email,
            source: 'ventura',
            stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
            targetDiff: action === 'BUY' ? 0.05 : -0.05,
            shouldCalculateDiff: isFutureFound,
        }
    } catch (err) {
        return null;
    }
}