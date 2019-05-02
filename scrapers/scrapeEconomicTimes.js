const puppeteer = require('puppeteer');
const _ = require('lodash');
const moment = require('moment');
const cheerio = require('cheerio');
const {userDetails} = require('../constants/scrapingUsers');

const url = 'https://economictimes.indiatimes.com/markets/stocks/recos';

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
        await page.setViewport({
            width: 1200,
            height: 900
        });
        
        await autoScroll(page); // Autoscrolling at the bottom of the page
    
        const body = await page.evaluate(() => document.querySelector('body').innerHTML);
        resolve(getPredictionData(body));
    } catch (err) {
        console.log('Error ', err.message);
        reject(err);
    }
});

const getPredictionData = (html) => {
    const dateFormat = 'D MMM, YYYY';
    const $ = cheerio.load(html);
    let data = [];
    $('div.eachStory').each((row, rawElement) => {
        const date = $(rawElement).find('time').text();
        const dateRegExp = /ago/i;
        if (isTodayDate(date) || date.search(dateRegExp) > -1) {
            const predictionText = $(rawElement).find('h3').text();
            data.push(parsePrediction(predictionText));
        }
    });
    data = data.filter(item => item);

    return data;
}

const parsePrediction = predictionText => {
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

    const rupeesIndex = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'rs');
    const targetIndex = _.findIndex(predictionTextArray, item => item.toLowerCase() === 'target');

    let target = rupeesIndex > -1 ? predictionTextArray[rupeesIndex + 1].split(':')[0] : 0;

    let stopLoss = null;

    let actionIndex = -2;
    if (isBuyFound) {
        const buyIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'BUY');
        actionIndex = buyIndex;
    } else {
        const sellIndex = _.findIndex(predictionTextArray, item => item.toUpperCase() === 'SELL');
        actionIndex = sellIndex;
    }

    let symbol = predictionTextArray.slice(actionIndex + 1, targetIndex).join(' ');
    symbol = symbol.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,''); // Replacing all special characters

    let advisor = predictionTextArray.slice(rupeesIndex + 2, predictionTextArray.length).join(' ');
    advisor = getAdvisor(advisor);
    const email = userDetails[advisor].email || userDetails.economicTimes.email;

    return {
        action,
        symbol,
        target,
        stopLoss,
        advisor,
        email,
        initializeStopLoss: true,
        stopLossDiff: action === 'BUY' ? -0.05 : 0.05,
        shouldCalculateDiff: true,
        source: advisor
    }
}

async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

const getAdvisor = advisorName => {
    const users = [
        {
            name: 'Edelweiss Securities',
            advisor: 'edelweiss'
        },
        {
            name: 'Emkay Global Financial Services',
            advisor: 'emkayGlobal'
        },
        {
            name: 'Prabhudas Lilladher',
            advisor: 'prabhudashLill'
        },
        {
            name: 'Phillip Capital (India)',
            advisor: 'phillipCapital'
        },
        {
            name: 'HDFC Securities',
            advisor: 'hdfcSecurities'
        },
        {
            name: 'Manas Jaiswal',
            advisor: 'manasJaiswal'
        },
        {
            name: 'Dr CK Narayan',
            advisor: 'drCkNaryan'
        },
        {
            name: 'Kunal Bothra',
            advisor: 'kunalBothra'
        },
        {
            name: 'Elara Capital',
            advisor: 'elaraCapital'
        },
        {
            name: 'Nirmal Bang Securities',
            advisor: 'nirmalBangSecurities'
        },
        {
            name: 'Kotak Securities',
            advisor: 'kotak'
        },
        {
            name: 'Motilal Oswal Securities',
            advisor: 'motilalOswal'
        },
        {
            name: 'Kotak Institutional Equities',
            advisor: 'kotakInstitutional'
        },
        {
            name: 'Reliance Securities',
            advisor: 'relianceSecurities'
        },
        {
            name: 'ICICI Securities',
            advisor: 'iciciSecurities'
        },
        {
            name: 'Axis Securities',
            advisor: 'axisSecurities'
        },
        {
            name: 'JM Financial',
            advisor: 'jmFinancial'
        },
        {
            name: 'SMC Global Securities',
            advisor:'smcGlobal'
        },
        {
            name: 'Anand Rathi',
            advisor: 'anandRathi'
        },
        {
            name: 'Nooresh Merani',
            advisor: 'nooreshMerani'
        },
        {
            name: 'Vaishali Parekh',
            advisor: 'vaishaliParekh'
        },
        {
            name: 'Mustafa Nadeem',
            advisor: 'mustafaNadeem'
        },
        {
            name: 'Mazhar Mohammad',
            advisor: 'mazharMohammad'
        },
        {
            name: 'Shabbir Kayyumi',
            advisor: 'shabbirKayyumi'
        },
        {
            name: 'Hadrien Mandonca',
            advisor: 'hadrienMandonca'
        },
        {
            name: 'Shitij Gandhi',
            advisor: 'shitijGandhi'
        },
        {
            name: 'Aditya Agarwala',
            advisor: 'adityaAgarwal'
        },
        {
            name: 'Jay Thakkar',
            advisor: 'jayThakkar'
        },
        {
            name: 'Manav Chopra',
            advisor: 'manavChopra'
        }
    ];

    const userIndex = _.findIndex(users, user => user.name.toLowerCase() === advisorName.toLowerCase());

    if (userIndex > -1) {
        return users[userIndex].advisor;
    } else {
        return 'economicTimes';
    }
}

const isTodayDate = (receivedDate) => {
    const dateFormat = 'D MMM, YYYY';
    const currentDay = moment().format('D');
    const currentMonth = moment().format('MMM');
    const currentYear = moment().format('YYYY');

    const currentDayRegExp = new RegExp(currentDay);
    const currentMonthRegExp = new RegExp(currentMonth);
    const currentYearRegExp = new RegExp(currentYear);

    const isEquals = receivedDate.search(currentDayRegExp) > -1
    && receivedDate.search(currentMonthRegExp) > -1
    && receivedDate.search(currentYearRegExp) > -1;

    return isEquals;
}