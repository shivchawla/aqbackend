/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:54:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-10-26 17:19:41
*/

const DailyContest = require('../Marketplace/DailyContestService');

module.exports.getDailyContestPredictions = (req, res, next) => {
    DailyContest.getDailyContestPredictions(req.swagger.params, res, next);
};

module.exports.updateDailyContestPredictions = (req, res, next) => {
    DailyContest.updateDailyContestPredictions(req.swagger.params, res, next);
};