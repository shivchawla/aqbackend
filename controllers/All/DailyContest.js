/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:54:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-05 16:32:13
*/

const DailyContest = require('../Marketplace/DailyContestService');

module.exports.getDailyContestPredictions = (req, res, next) => {
    DailyContest.getDailyContestPredictions(req.swagger.params, res, next);
};

module.exports.updateDailyContestPredictions = (req, res, next) => {
    DailyContest.updateDailyContestPredictions(req.swagger.params, res, next);
};

module.exports.getDailyContestPnl = (req, res, next) => {
    DailyContest.getDailyContestPnl(req.swagger.params, res, next);
};

module.exports.updateDailyContestPnl = (req, res, next) => {
    DailyContest.updateDailyContestPnl(req.swagger.params, res, next);
};

module.exports.getDailyContestTopStocks = (req, res, next) => {
    DailyContest.getDailyContestTopStocks(req.swagger.params, res, next);
};

module.exports.updateDailyContestTopStocks = (req, res, next) => {
    DailyContest.updateDailyContestTopStocks(req.swagger.params, res, next);
};

module.exports.getDailyContestWinners = (req, res, next) => {
    DailyContest.getDailyContestWinners(req.swagger.params, res, next);
};