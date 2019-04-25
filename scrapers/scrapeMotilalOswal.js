/**
 * This file crawls MOTILAL STOCK ADVICE and gets the data in the required format
 */

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const moment = require('moment');

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
    data = data.filter(dataItem => {
        const dateFormat = 'DD-MMM';
        const recomdDate = moment(dataItem.recomdDate, dateFormat).format(dateFormat);

        return recomdDate === moment().format(dateFormat);
    });

    return data;
}

const getSymbol = inputString => {
    // "Redirect2Trade('NSE','DCBBANK','0','214.35','BUY','0','0','EQ');"
    // We choose the string between the open and close paranthesis
    const openParaIndex = inputString.indexOf('(');
    const closeParaIndex = inputString.indexOf(')');

    let arguments = inputString.slice(openParaIndex + 1, closeParaIndex);

    // Replacing all the single quotes from the string
    arguments = arguments.replace(/["']/g, "");

    arguments = arguments.split(',');

    // Returning the second element since it contains the symbol
    return arguments[1];
}