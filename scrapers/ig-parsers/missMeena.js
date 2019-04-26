const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {
    try {
        // Replace all commas
        predictionText = predictionText.replace(/[",]/g, "");

        // Replacing ₹
        predictionText = predictionText.replace(/₹/i, "_");

        const predictionTextArray = predictionText.split(' ');

        // Checking for PE
        const isPEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'pe') > -1;

        // Checking for CE
        const isCEFound = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'ce') > -1;

        // Checking for ellipsis
        const ellipsisRegExp = /(^|[^.])\.{4}(?!\.)/
        const isEllipsisFound = predictionText.search(ellipsisRegExp) > -1;

        // Checking for future
        const futureRegExp = /Fut/i
        const isFutureFound = predictionText.search(futureRegExp) > -1;

        // Checking for PUT
        const putRegExp = /Put/i
        const isPutFound = predictionText.search(putRegExp) > -1;

        // Checking for Exit
        const exitRegExp = /Exit/i
        const isExitFound = predictionText.search(exitRegExp) > -1;

        if (isEllipsisFound || isFutureFound || isExitFound || isPEFound || isCEFound || isPutFound) {
            return null;
        }

        const buyRegExp = /Long/i
        const isBuyFound = predictionText.search(buyRegExp) > -1;

        const sellRegExp = /Short/i
        const isSellFound = predictionText.search(sellRegExp) > -1;

        if (!isBuyFound && !isSellFound) {
            return null;
        }

        const action = isBuyFound ? 'BUY' : 'SELL';

        // Target is in the format 
        const targetRegExp = /tgt@/i;
        const targetIndex = _.findIndex(predictionTextArray, item => item.search(targetRegExp) > -1);
        let target = predictionTextArray[targetIndex];
        target = target.split('@')[1].split('_')[0];

        const stopLossRegExp = /sl@/i;
        const stopLossIndex = _.findIndex(predictionTextArray, item => item.search(stopLossRegExp) > -1);

        let stopLoss = predictionTextArray[stopLossIndex];
        stopLoss = stopLoss.split('@')[1].split('_')[0];

        let symbol = null;
        if (predictionTextArray[1].search(buyRegExp) > -1 ||
            predictionTextArray[1].search(sellRegExp) > -1) {
            symbol = predictionTextArray[0];
        } else {
            symbol = predictionTextArray[0] + predictionTextArray[1];
        }
        symbol = symbol.toUpperCase();

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
            email: userDetails.missMeena.email,
            source: 'missMeena'
        }
    } catch (err) {
        return null;
    }
}