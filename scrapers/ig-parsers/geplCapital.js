const _ = require('lodash');
const {userDetails} = require('../../constants/scrapingUsers');

module.exports = (predictionText, advisorName = '') => {    
    // Replace all commas
    predictionText = predictionText.replace(/[",]/g, "");

    const predictionTextArray = predictionText.split(' ');

    // Checking for CE
    const ceRegExp = /CE/i
    const isCEFound = predictionText.search(ceRegExp) > -1;

    // Checking for CE
    const peRegExp = /PE/i
    const isPEFound = predictionText.search(peRegExp) > -1;

    if (isCEFound || isPEFound) {
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
        advisorName,
        email: userDetails.geplCapital.email,
        source: 'geplCapital'
    }
}