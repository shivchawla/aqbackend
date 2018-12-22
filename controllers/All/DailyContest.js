/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:54:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-22 13:21:54
*/

const DailyContest = require('../Marketplace/DailyContestService');

module.exports.getDailyContestPredictions = (req, res, next) => {
    DailyContest.getDailyContestPredictions(req.swagger.params, res, next);
};

module.exports.updateDailyContestPredictions = (req, res, next) => {
    DailyContest.updateDailyContestPredictions(req.swagger.params, res, next);
};

module.exports.getDailyContestPnlForDate = (req, res, next) => {
    DailyContest.getDailyContestPnlForDate(req.swagger.params, res, next);
};

module.exports.getDailyContestNextStock = (req, res, next) => {
    DailyContest.getDailyContestNextStock(req.swagger.params, res, next);
};

module.exports.updateDailyContestPnlForDate = (req, res, next) => {
    DailyContest.updateDailyContestPnlForDate(req.swagger.params, res, next);
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

module.exports.sendEmailToDailyContestWinners = (req, res, next) => {
    DailyContest.sendEmailToDailyContestWinners(req.swagger.params, res, next);
};

module.exports.sendSummaryEmailToParticipants = (req, res, next) => {
    DailyContest.sendSummaryEmailToParticipants(req.swagger.params, res, next);
};

module.exports.sendTemplateEmailToParticipants = (req, res, next) => {
    DailyContest.sendTemplateEmailToParticipants(req.swagger.params, res, next);
};

module.exports.getDailyContestStats = (req, res, next) => {
	DailyContest.getDailyContestStats(req.swagger.params, res, next);
};

module.exports.exitDailyContestPrediction = (req, res, next) => {
    DailyContest.exitDailyContestPrediction(req.swagger.params, res, next);
};