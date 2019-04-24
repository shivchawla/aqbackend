const Nightmare = require('nightmare');
const cheerio = require('cheerio');
const _ = require('lodash');

const nightmare = new Nightmare({show: false});
const url = 'http://www.investmentguruindia.com/intradaytips?page=1&per_page=100&autorefresh=off';

module.exports = () => new Promise((resolve, reject) => {
    // Request using nightmare
    nightmare
    .goto(url)
    .wait('body')
    .evaluate(() => document.querySelector('body').innerHTML)
    .end()
    .then(response => {
        resolve(getPredictionData(response));
    })
    .catch(err => {
        console.log('Error ', err);
        reject(err);
    });
})

const getPredictionData = html => {
    const $ = cheerio.load(html);
    let data = [];
    $('div.gepl_box').each((row, rawElement) => {
        const predictionText = $(rawElement).find('p:nth-child(2)').text();
        const advisorName = $(rawElement).find('div.gspl_right h2 a').text();
        const prediction = processPredictionText(predictionText, advisorName);
        data.push(prediction);
    });

    return filterCorrectPredictions(data);
};

const processPredictionText = (predictionText, advisorName) => {
    predictionText = predictionText.replace(/[".]/g, "");
    predictionText = predictionText.split(' ');

    let symbol = '';
    const stopLossIndex = predictionText.indexOf('SL') > -1 
        ? predictionText.indexOf('SL')
        : predictionText.indexOf('LOSS');
    const targetIndex = predictionText.indexOf('TGT') > -1 
        ? predictionText.indexOf('TGT')
        : predictionText.indexOf('TARGET');
    const recomdPriceIndex = predictionText.indexOf('@') > -1 
        ? predictionText.indexOf('@')
        : predictionText.indexOf('AT');

    const buyRegExp = /Buy/i;
    const sellRegExp = /Sell/i;

    const buyIndex = _.findIndex(predictionText, item => item.search(buyRegExp) > -1);
    const sellIndex = _.findIndex(predictionText, item => item.search(sellRegExp) > -1);

    if (buyIndex > -1) {
        symbol = predictionText[buyIndex + 1];
    } else {
        symbol = predictionText[sellIndex + 1];
    }

    const action = buyIndex > 0 ? 'BUY' : 'SELL';
    let stopLoss = stopLossIndex > - 1 ? predictionText[stopLossIndex + 1] : null;
    let target = targetIndex > -1 ?  predictionText[targetIndex + 1] : null;
    let recomdPrice = recomdPriceIndex > -1 ? predictionText[recomdPriceIndex + 1] : null;

    try {
        if (stopLoss) {
            stopLoss = stopLoss.match(/\d+/g).map(Number);
            stopLoss = stopLoss[0];
        }

        if (target) {
            target = target.match(/\d+/g).map(Number);
            target = target[0];
        }

        if (recomdPrice) {
            recomdPrice = recomdPrice.match(/\d+/g).map(Number);
            recomdPrice = recomdPrice[0];
        }
    } catch(err) {}

    return {
        stopLoss,
        target,
        action,
        symbol,
        recomdPrice,
        advisorName
    };
}

const filterCorrectPredictions = predictions => {
    return predictions.filter(prediction => {
        return (
            prediction.stopLoss !== null && !checkIfNotNumber(prediction.stopLoss) &&
            prediction.target !== null && !checkIfNotNumber(prediction.target) &&
            prediction.action !== null && 
            prediction.symbol !== null
        );
    })
}

const checkIfNotNumber = value => {
    const num = Number(value);

    return _.isNaN(num);
}