/**
 * This file crwals EDELWEISS and gets the data in the required format
 */

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const _ = require('lodash');
const moment = require('moment');

const url = 'https://www.edelweiss.in/oyo/equity/top-market-and-stock-recommendations/equity?redirectParam=EQ,Short%20term';

module.exports = () => new Promise(async (resolve, reject) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 900 });
        await page.goto(url, {waitUntil: 'networkidle2'});

        const body = await page.evaluate(() => {
            return document.querySelector('body').innerHTML;
        });

        resolve(getPredictionData(body));

        await browser.close();

    } catch(err) {
        console.log('Error ', err.message);
        reject(err);
    }
})
 
const getPredictionData = html => {
    const $ = cheerio.load(html);
    let data = [];
    $('div.table div.schemesBlock').each((row, rawElement) => {

        const symbol = $(rawElement).find('div.trw div.stock-name a label:nth-child(2)').text();
        let startDate = $(rawElement).find('div.trw div.reco-date label').text();
        startDate = getStartDate(startDate);
        let target = $(rawElement).find('div.trw label.target-price label:nth-child(2) label').text();
        if (target.length === 0) {
            target = $(rawElement).find('div.trw label.target-price label:nth-child(1) label').text();
        }
        let stopLoss = $(rawElement).find('div.trw.panel-collapse div.dropdown-cont div:nth-child(2) ul li:nth-child(2) label').text().trim();
        stopLoss = stopLoss.replace(/["\n]/g, ""); // Removing all the the new lines
        stopLoss = stopLoss.replace(/[",]/g, ""); // Removing all the single quotes
        stopLoss = stopLoss.split(' '); // Splitting by spaces
        const rupeesIndex = stopLoss.indexOf('Rs.'); // Stop Loss is found after the Rs. string
        stopLoss = stopLoss[rupeesIndex + 1];

        let action = $(rawElement).find('div.trw.raw  label.per-action a').text();

        const internalData = {
            symbol,
            startDate,
            stopLoss: convertToNumber(stopLoss),
            target: convertToNumber(target),
            horizon: 1,
            action
        };
        data.push(internalData);
    });
    data = data.filter(dataItem => {
        const dateFormat = 'DD MMM YYYY';
        const startDate = moment(dataItem.startDate, dateFormat).format(dateFormat);
        const currentDate = moment().format(dateFormat);

        return startDate === currentDate;
    })
    data = data.filter(dataItem => {
        return dataItem.action.toUpperCase() === 'BUY' || dataItem.action.toUpperCase() === 'SELL';
    });

    return data;
}

const convertToNumber = inputString => {
    inputString = inputString.replace(/[",]/g, "");

    return Number(inputString);
}

const getStartDate = startDate => {
    startDate = startDate.trim();
    startDate = startDate.replace(/["\n]/g, "");
    startDate = startDate.replace(/\s+/g,' ');
    startDate = startDate.split(' ');
    const date = startDate[0];
    const month = startDate[1];
    const year = startDate[2];

    startDate = `${date} ${month} ${year}`;

    return startDate;
}