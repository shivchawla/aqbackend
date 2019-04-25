const puppeteer = require('puppeteer');
const moment = require('moment');
const cheerio = require('cheerio');
const _ = require('lodash');

const choiceParser = require('./ig-parsers/choiceInternational');
const geplParser = require('./ig-parsers/geplCapital');
const hemSecuritiesParser = require('./ig-parsers/hemSecurities');
const kifsTradeParser = require('./ig-parsers/kifsTrade');

const url = 'http://www.investmentguruindia.com/intradaytips?page=1&per_page=100&autorefresh=off';


module.exports = () => new Promise(async (resolve, reject) => {
    console.log('Investment Guru called');
    try {
        const browser = await puppeteer.launch();
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
});

const getPredictionData = html => {
    const $ = cheerio.load(html);
    let data = [];
    console.log('getPredictionData investment guru called'); 
    $('div.gepl_box').each((row, rawElement) => {
        const predictionText = $(rawElement).find('p:nth-child(2)').text();
        const advisorName = $(rawElement).find('div.gspl_right h2 a').text();
        let date = $(rawElement).find('div.gspl_right p').text();
        const currentDate = moment().format('DD/MM/YYYY');
        const isToday = date.indexOf(currentDate) > -1;

        if (!isToday) {
            return null;
        }

        let prediction = null;
        if (advisorName.toLowerCase() === 'choice international ltd') {
            prediction = choiceParser(predictionText, advisorName);
        } else if (advisorName.toLowerCase() === 'gepl capital') {
            prediction = geplParser(predictionText, advisorName);
        } else if (advisorName.toLowerCase() === 'hem securities ltd') {
            prediction = hemSecuritiesParser(predictionText, advisorName);
        } else if (advisorName.toLowerCase() === 'kifs trade capital') {
            prediction = kifsTradeParser(predictionText, advisorName);
        }
        
        
        data.push(prediction);
    });
    data = data.filter(item => item !== null);

    return data;
};
