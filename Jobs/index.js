/*
* @Author: Shiv Chawla
* @Date:   2018-02-28 10:55:24
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-28 12:52:57
*/

'use strict';
const PerformanceHelper = require('../controllers/helpers/Performance');
const AnalyticsHelper = require('../controllers/helpers/Analytics');
const schedule = require('node-schedule');

schedule.scheduleJob("0 * * * * *", function() {
    updateAllAnalytics();
});


function updateAllAnalytics() {
	return PerformanceHelper.updatePerformanceAllAdvices()
	.then(updated => {
		return AnalyticsHelper.updateAllAdviceAnalytics();
	})
	.then(updated => {
		return AnalyticsHelper.updateAllAdvisorAnalytics();	
	})
	.catch(err => {
		console.log(err.message);
	})
}
