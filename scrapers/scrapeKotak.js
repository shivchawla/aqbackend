/**
 * This file crwals KOTAK SECURITIES and gets the data in the required format
 */

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const _ = require('lodash');
const moment = require('moment');

const technicalUrl = 'https://www.kotaksecurities.com/ksweb/ResearchCall/Technical';
const fundamentalUrl = 'https://www.kotaksecurities.com/ksweb/ResearchCall/Fundamental';

module.exports = (type = null) => new Promise(async (resolve, reject) => {
    try {
        let url = null;
        switch(type) {
            case 'technical':
                url = technicalUrl;
                break;
            case 'fundamental':
                url = fundamentalUrl;
                break;
            default:
                url = technicalUrl;
                break;
        }

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.goto(url, {waitUntil: 'networkidle2'});

        const body = await page.evaluate(() => {
            return document.querySelector('body').innerHTML;
        });

        resolve(getPredictionData(body, type));

        await browser.close();

    } catch(err) {
        console.log('Error ', err.message);
        reject(err);
    }
})

const getPredictionData = (html, type = null) => {
    const dateFormat = 'YYYY-MM-DD';
    const readFormat = 'MM/DD/YYYY h:mm:ss A';
    const $ = cheerio.load(html);
    let data = [];
    $('div.mdi-border').each((row, raw_element) => {
        let symbol = '';
        let weirdFormat = $(raw_element).find('div.s12 span.carddetail span.ksec-card-detail').text();

        // Split weird format by space, then find the index in the array where it is either 'BUY' or 'SELL'
        // using that index we can find symbol, since symbol is always after the action
        const weirdFormatArray = weirdFormat.split(' ');
        
        // Check for buy index
        const buyIndex = weirdFormatArray.indexOf('BUY');
        // Check for sell index
        const sellIndex = weirdFormatArray.indexOf('SELL');

        // If KALRT(Kotak Alert) is present only then the prediction should be added 
        // Check if KALRT present
        const kalrtRegExp = /KALRT/i;
        const isAlert = weirdFormat.search(kalrtRegExp) > -1;

        // Getting the index for days the horizon is in the index before that
        const daysIndex = weirdFormatArray.indexOf('Days');
        const horizon = daysIndex > -1 ? weirdFormatArray[daysIndex - 1] : 2;
        let startDate = $(raw_element).find('div.mdl-card__actions div.RecoDate span').text();
        startDate = moment(startDate, readFormat).format(dateFormat);

        if (buyIndex > -1) {
            symbol = weirdFormatArray[buyIndex + 1];
        } else {
            symbol = weirdFormatArray[sellIndex + 1];
        }

        const name = $(raw_element).find('span.listview-symbol').text().trim();
        const industry = $(raw_element).find('div.mdl-card__title span span:nth-child(2)').text();
        let action = $(raw_element).find('div.mdl-card__menuM button.rcaction:nth-child(3)').text();
        if (type === 'fundamental') {
            action = $(raw_element).find('div.mdl-card__menuM button:nth-child(4)').text();
        }
        
        symbol = isAlert ? symbol : name;

        let internalData = {
            symbol,
            isAlert,
            predictionText: weirdFormat,
            name,
            action,
            industry,
            startDate,
            horizon: Number(horizon)
        };

        // Getting all the metrics in each individual card
        $(raw_element).find('div.mdl-card__supporting-text div.mdl-grid div.mdl-list__item').each((row, detailRawElement) => {
            let requiredHeader = $(detailRawElement).find('span.mdl-list__item-sub-title').text();
            const requiredValue = $(detailRawElement).find('span:nth-child(2)').text();
            // Convert the header to camel case
            requiredHeader = keyKVP[requiredHeader.toLowerCase()];

            // console.log('Header ', requiredHeader);
            // console.log('Value ', requiredValue);

            if (requiredHeader !== undefined) {
                // Setting the camel case header as the value
                const requiredData = {[requiredHeader]: requiredValue};
                internalData = {...internalData, ...requiredData};
            }
        });
        // Pushing each individual card data for a particular symbol
        data.push(processInternalData(internalData, type));
    });
    data = data.filter(dataItem => dataItem.startDate === moment().format(dateFormat));

    return data;
}

const keyKVP = {
    'current price': 'currentPrice',
    'recomd price': 'recomdPrice',
    'stop loss price': 'stopLoss',
    'target': 'target',
    'potential return': 'potentialReturn',
    'status': 'status',
    'accrued return': 'accruedReturn',
    'market cap(in cr.)': 'marketCap' 
};

// Process internal data to the correct fornats where required
const processInternalData = (data, type = null) => {
    let target = _.get(data, 'target', '0');
    let currentPrice = _.get(data, 'currentPrice', '0');
    let recomdPrice = _.get(data, 'recomdPrice', '0');
    let stopLoss = _.get(data, 'stopLoss', '0');
    let marketCap = _.get(data, 'marketCap', '0');
    let action = _.get(data, 'action', 'Buy');

    target = convertToNumber(target);
    currentPrice = convertToNumber(currentPrice);
    stopLoss = convertToNumber(stopLoss);
    marketCap = convertToNumber(marketCap);
    recomdPrice = convertToNumber(recomdPrice);

    if (type === 'fundamental') {
        if (action.toUpperCase() === 'BUY') {
            stopLoss = recomdPrice - (0.05 * recomdPrice);
        } else {
            stopLoss = recomdPrice + (0.05 * recomdPrice);
        }
    }

    return {
        ...data,
        target,
        currentPrice,
        stopLoss,
        marketCap
    }
}

const convertToNumber = inputString => {
    inputString = inputString.replace(/[",]/g, "");

    return Number(inputString);
}