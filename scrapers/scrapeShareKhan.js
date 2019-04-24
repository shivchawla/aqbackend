/**
 * This file crawls ShareKhan and gets the data in the required format
 */
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const _ = require('lodash');

const url = 'https://www.sharekhan.com/research/research-traders/todays-call';

module.exports = () => new Promise(async (resolve, reject) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.goto(url, {waitUntil: 'networkidle2'});
        await page.waitFor(4000);

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