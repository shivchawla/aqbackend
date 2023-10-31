/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-05-21 15:46:21
*/

'use strict';
const BacktestHelper = require('../controllers/helpers/Backtest');
const schedule = require('node-schedule');
const config = require('config');

const serverPort = require('../index').serverPort;

if (config.get('jobsPort') === serverPort) {
	
	schedule.scheduleJob("30 18 * * *", function() {
	    BacktestHelper.resetBacktestCounter()
	});

}


