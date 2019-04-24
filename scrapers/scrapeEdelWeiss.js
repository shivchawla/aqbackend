/**
 * This file crwals EDELWEISS and gets the data in the required format
 */

const Nightmare = require('nightmare');
const cheerio = require('cheerio');
const _ = require('lodash');

const nightmare = new Nightmare({
    show: false,
    loadTimeout: 10 * 1000,
    width: 1200,
    height: 900
});
const url = 'https://www.edelweiss.in/oyo/equity/top-market-and-stock-recommendations/equity?redirectParam=EQ,Short%20term';

module.exports = () => {
    return new Promise((resolve, reject) => {
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
}

const getPredictionData = html => {
    const $ = cheerio.load(html);
    let data = [];
    $('div.table div.schemesBlock').each((row, rawElement) => {

        const symbol = $(rawElement).find('div.trw div.stock-name a label:nth-child(2)').text();
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
            stopLoss: convertToNumber(stopLoss),
            target: convertToNumber(target),
            horizon: 1,
            action
        };
        data.push(internalData);
    });
    data = data.filter(dataItem => {
        return dataItem.action.toUpperCase() === 'BUY' || dataItem.action.toUpperCase() === 'SELL';
    });

    return data;
}

const convertToNumber = inputString => {
    inputString = inputString.replace(/[",]/g, "");

    return Number(inputString);
}