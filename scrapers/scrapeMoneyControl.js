const puppeteer = require('puppeteer');
const moment = require('moment');
const _ = require('lodash');
const cheerio = require('cheerio');
const {userDetails} = require('../constants/scrapingUsers');

const url = 'https://www.google.com/search?rlz=1C5CHFA_enIN695IN695&ei=jfXDXJeRFs7erQG3mLiACg&q=top+buy+and+sell+ideas+moneycontrol&oq=Top+buy+and+sell+ideas+m&gs_l=psy-ab.1.0.0.5162.5985..7187...1.0..0.185.267.1j1......0....1..gws-wiz.kPk87Ro7of0';

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
        await page.goto(url, {
            waitUntil: 'networkidle2'
        });

        const googleBody = await page.evaluate(() => {
            return document.querySelector('body').innerHTML;
        });

        const nextUrl = getMoneyControlUrl(googleBody);

        await page.goto(nextUrl, {
            waitUntil: 'networkidle2'
        });

        const moneyControlBody = await page.evaluate(() => {
            return document.querySelector('body').innerHTML;
        });

        resolve(getPredictionData(moneyControlBody));

        await browser.close();
    } catch (err) {
        console.log('Error ', err.message);
        reject(err);
    }
})

const getMoneyControlUrl = html => {
    const $ = cheerio.load(html);
    let urls = [];
    $('div.srg').each((row, rawElement) => {
        const url = $('div.rc div.r a').attr('href');
        urls.push(url);
    });

    return urls[0];
}

const getPredictionData = html => {
    const $ = cheerio.load(html)
    const data = [];
    let publishedDate = $('div.article_box div.arttidate').text();

    // Removing extra white spaces
    publishedDate = publishedDate.replace(/\s+/g, ' ');

    const todayDate = moment().format('MMM DD, YYYY');
    const isPublishedToday = publishedDate.indexOf(todayDate) > -1;

    if (isPublishedToday) {
        $('p').each((row, rawElement) => {
            const text = $(rawElement).text();
            const stopLossRegExp = /stop loss/i;
            const targetRegExp = /target/i;

            const isPrediction = text.search(stopLossRegExp) > -1 && text.search(targetRegExp) > -1;

            if (isPrediction) {
                let advisor = $(rawElement).prevAll('p').find('strong').first().text();
                advisor = getAdvisor(advisor);
                data.push(parsePrediction(text, advisor.user, advisor.email))
            }
        })
    } else {
        console.log('No Moneycontrol predictions found for today');
    }

    return data;
}

const parsePrediction = (predictionText, advisor, email = null) => {
    // replace comma
    predictionText = predictionText.replace(/[",]/g, "");
    const predictionTextArray = predictionText.split(/(\s+)/).filter(item => item.trim().length > 0);

    const buyRegExp = /Buy/i
    const isBuyFound = predictionText.search(buyRegExp) > -1;

    const sellRegExp = /Sell/i
    const isSellFound = predictionText.search(sellRegExp) > -1;

    if (!isBuyFound && !isSellFound) {
        return null;
    }

    const action = isBuyFound ? 'BUY' : 'SELL';

    const targetRegExp = /TARGET/i;
    const targetIndex = _.findIndex(predictionTextArray, item => item.search(targetRegExp) > -1);

    let target = predictionTextArray[targetIndex + 3];

    const stopLossRegExp = /LOSS/i;
    const stopLossIndex = _.findIndex(predictionTextArray, item => item.search(stopLossRegExp) > -1);

    let stopLoss = predictionTextArray[stopLossIndex + 3];

    let actionIndex = -2;
    if (isBuyFound) {
        const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'BUY');
        actionIndex = buyIndex;
    } else {
        const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SELL');
        actionIndex = sellIndex;
    }

    const withIndex = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'with');
    let symbol = predictionTextArray.slice(actionIndex + 1, withIndex).join(' ');
    symbol = symbol.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,''); // Replacing all special characters
    
    return {
        action,
        symbol,
        stopLoss,
        target,
        advisor,
        email
    }
}

const getAdvisor = advisor => {
    const prakashGabaRegExp = /Prakash Gaba/i;
    const miteshThakkarRegExp = /Mitessh Thakkar/i;
    const ashwaniRegExp = /Ashwani Gujral/i;
    const sudarshanRegExp = /Sudarshan Sukhani/i;

    if (advisor.search(prakashGabaRegExp) > -1)  {
        return {user: 'prakashgaba', email: userDetails.prakashgaba.email};
    } else if (advisor.search(miteshThakkarRegExp) > -1) {
        return {user: 'mitesshthakkar', email: userDetails.mitesshthakkar.email};
    } else if (advisor.search(ashwaniRegExp) > -1) {
        return {user: 'ashwanigujral', email: userDetails.ashwanigujral.email};
    } else if (advisor.search(sudarshanRegExp) > -1) {
        return {user: 'sudarshanSukhani', email: userDetails.sudarshanSukhani.email};
    } else {
        return {user: 'moneycontrol', email: userDetails.moneyControl.email};
    }
}
