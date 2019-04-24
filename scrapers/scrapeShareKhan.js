/**
 * This file crawls ShareKhan and gets the data in the required format
 */

const Nightmare = require('nightmare');
const cheerio = require('cheerio');
const _ = require('lodash');

const nightmare = new Nightmare({
    show: false,
    loadTimeout: 10 * 1000
});
const url = 'https://www.sharekhan.com/research/research-traders/todays-call';

module.exports = () => {
    return new Promise((resolve, reject) => {
        // Request using nightmare
        nightmare
        .goto(url)
        .wait(4000)
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
    const bodyText = $('div.maxContainer').text();
    $('div.loderTable table tbody tr').each((row, rawElement) => {
        const symbol = $(rawElement).find('td:nth-child(1) span span:nth-child(1) b').text();
        const action = $(rawElement).find('td:nth-child(2) a').text();
        const currentPrice = $(rawElement).find('td:nth-child(5)').text();
        const targetOne = $(rawElement).find('td:nth-child(6)').text();
        const targetTwo = $(rawElement).find('td:nth-child(7)').text();
        const horizon = 5;
        const stopLoss = $(rawElement).find('td:nth-child(8)').text();
        
        const shareKhanPredictionOne = {
            symbol,
            action,
            currentPrice: convertToNumber(currentPrice),
            target: convertToNumber(targetOne),
            horizon,
            stopLoss: convertToNumber(stopLoss),
            advisorName: 'ShareKhanOne'
        };

        const shareKhanPredictionTwo = {
            symbol,
            action,
            currentPrice: convertToNumber(currentPrice),
            target: convertToNumber(targetTwo),
            horizon,
            stopLoss: convertToNumber(stopLoss),
            advisorName: 'ShareKhanTwo'
        };

        data.push(shareKhanPredictionOne);
        data.push(shareKhanPredictionTwo);
    });

    return data;
}

const convertToNumber = inputString => {
    inputString = inputString.replace(/[",]/g, "");

    return Number(inputString);
}