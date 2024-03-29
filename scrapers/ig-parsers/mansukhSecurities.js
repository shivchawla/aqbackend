const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    try {
        const predictionTextArray = predictionText.split(' ');

        // Checking for PE
        const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

        // Checking for CE
        const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;

        // Checking for CALL
        const isCallFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'call') > -1;

        // Checking for book
        const isBookFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'book') > -1;

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

        // Checking for PUT
        const putRegExp = /Put/i
        const isPutFound = predictionText.search(putRegExp) > -1;

        // Checking for Exit
        const exitRegExp = /Exit/i
        const isExitFound = predictionText.search(exitRegExp) > -1;

        if (isEllipsisFound || isExitFound || isPEFound || isCEFound || isPutFound || isCallFound || isBookFound) {
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
        let target = targetIndex > -1 ? predictionTextArray[targetIndex + 1] : '0';
        target = target.split('-')[0];

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
        let symbolIndex = null;
        let actionIndex = -2;
        if (isBuyFound) {
            const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'BUY');
            actionIndex = buyIndex;
        } else {
            const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SELL');
            actionIndex = sellIndex;
        }

        symbolIndex = actionIndex + 1;
        symbol = predictionTextArray[symbolIndex];

        const daysIndex = _.findIndex(predictionTextArray, item => (item.toUpperCase() === 'DAYS' || item.toUpperCase() === 'WEEKLY'));

        if (daysIndex > -1) {
            symbolIndex = daysIndex + 1;
            symbol = predictionTextArray[symbolIndex];
        }

        if (isFutureFound) {
            const futureIndex = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'fut');
            symbol = predictionTextArray.slice(actionIndex + 1, futureIndex).join(' ');
        } else {
            let iteratorIndex = symbolIndex;
            let symbolArr = [];
            while(isNaN(Number(predictionTextArray[iteratorIndex]))) {
              symbolArr.push(predictionTextArray[iteratorIndex]);
              iteratorIndex++;
            }
            symbol = symbolArr.join(' ');
        }

        return {
            action,
            symbol,
            stopLoss,
            target,
            horizon: isIntraDayFound ? 0 : 1, 
            advisorName,
            email: userDetails.mansukhSecurities.email,
            source: 'mansukhSecurities',
            stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
            targetDiff: action === 'BUY' ? 0.05 : -0.05,
            shouldCalculateDiff: isFutureFound,
            initializeStopLoss: isNaN(Number(stopLoss)) 
        };
    } catch (err) {
        return null;
    }
}