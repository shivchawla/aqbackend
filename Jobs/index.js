/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-05-30 12:51:58
*/

'use strict';
const PortfolioHelper = require('../controllers/helpers/Portfolio');
const AnalyticsHelper = require('../controllers/helpers/Analytics');
const SecurityHelper = require('../controllers/helpers/Security');
const schedule = require('node-schedule');

//Run every 5th minute
schedule.scheduleJob("*/50 * * * *", function() {
    AnalyticsHelper.updateAllAnalytics();
});

schedule.scheduleJob("0 23 * * *", function() {
    SecurityHelper.updateStockList();
});

schedule.scheduleJob("30 22 * * *", function() {
    PortfolioHelper.updateAllPortfoliosForSplitsAndDividends();
});
