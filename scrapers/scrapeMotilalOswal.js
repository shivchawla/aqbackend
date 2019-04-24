/**
 * This file crawls MOTILAL STOCK ADVICE and gets the data in the required format
 */

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const url = 'https://www.motilaloswal.com/stock-advice.aspx';

module.exports = () => new Promise(async (resolve, reject) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
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

    $('tbody tr.brderadvicetab').each((row, rawElement) => {
        const name = $(rawElement).find('td:nth-child(1) p').text();
        const recomdPrice = $(rawElement).find('td:nth-child(2) p').text();
        const recomdDate = $(rawElement).find('td:nth-child(3) p').text();
        const cmp = $(rawElement).find('td:nth-child(4) p').text();
        const target = $(rawElement).find('td:nth-child(5) p').text();
        const stopLoss = $(rawElement).find('td:nth-child(6) p').text();
        const action = $(rawElement).find('td:nth-child(7) div a').attr('class');
        const onClick = $(rawElement).find('td:nth-child(7) div a').attr('onclick');
        const symbol = getSymbol(onClick);

        const internalData = {symbol, name, recomdPrice, recomdDate, cmp, target, stopLoss, action};

        data.push(internalData);
    });

    return data;
}

const getSymbol = inputString => {
    // "Redirect2Trade('NSE','DCBBANK','0','214.35','BUY','0','0','EQ');"
    // We choose 15 as the start index since we don't want the method name and the first paranthesis
    // We choose myString.length - 2 since we dont't the ; and )
    let arguments = inputString.slice(15, inputString.length - 2);

    // Replacing all the single quotes from the string
    arguments = arguments.replace(/["']/g, "");

    arguments = arguments.split(',');

    // Returning the second element since it contains the symbol
    return arguments[1];
}