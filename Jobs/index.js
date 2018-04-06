/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-06 12:22:13
*/

'use strict';
const PortfolioHelper = require('../controllers/helpers/Portfolio');
const AnalyticsHelper = require('../controllers/helpers/Analytics');
const SecurityHelper = require('../controllers/helpers/Security');
const schedule = require('node-schedule');

//Run every 5th minute
schedule.scheduleJob("*/5 * * * *", function() {
    AnalyticsHelper.updateAllAnalytics();
});

schedule.scheduleJob("*/20 * * * *", function() {
    //SecurityHelper.updateStockList();
});

schedule.scheduleJob("*/1 * * * *", function() {
    //PortfolioHelper.updateAllPortfoliosForSplitsAndDividends();
});
