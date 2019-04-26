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
        const product = $(rawElement).find('td:nth-child(3)').text();
        let currentPrice = $(rawElement).find('td:nth-child(5)').text();
        let targetOne = $(rawElement).find('td:nth-child(6)').text();
        let recommendedPrice = $(rawElement).find('td:nth-child(4)').text();
        const horizon = 5;
        let stopLoss = $(rawElement).find('td:nth-child(8)').text();
        const allowed = product.toLocaleLowerCase() !== 'derivative idea';
        currentPrice = convertToNumber(currentPrice);
        targetOne = convertToNumber(targetOne);
        stopLoss = convertToNumber(stopLoss);
        recommendedPrice = convertToNumber(recommendedPrice);

        const stopLossDiff = (stopLoss - recommendedPrice) / recommendedPrice;
        const targetDiff = (targetOne - recommendedPrice) / recommendedPrice;
        
        const shareKhanPredictionOne = {
            symbol,
            action,
            currentPrice,
            target: targetOne,
            horizon,
            stopLoss,
            advisorName: 'ShareKhanOne',
            allowed,
            stopLossDiff,
            targetDiff,
            shouldCalculateDiff: true,
            recommendedPrice
        }; 

        data.push(shareKhanPredictionOne);
    });
    data = data.filter(item => item.allowed);

    return data;
}

const convertToNumber = inputString => {
    inputString = inputString.replace(/[",]/g, "");

    return Number(inputString);
}