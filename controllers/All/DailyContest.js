/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:54:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-06 12:59:15
*/

const DailyContest = require('../Marketplace/DailyContestService');

module.exports.getDailyContestPredictions = (req, res, next) => {
    DailyContest.getDailyContestPredictions(req.swagger.params, res, next);
};

module.exports.getRealTradePredictions = (req, res, next) => {
    DailyContest.getRealTradePredictions(req.swagger.params, res, next);
};

module.exports.updateDailyContestPredictions = (req, res, next) => {
    DailyContest.updateDailyContestPredictions(req.swagger.params, res, next);
};

module.exports.getDailyContestPnlForDate = (req, res, next) => {
    DailyContest.getDailyContestPnlForDate(req.swagger.params, res, next);
};

module.exports.getDailyContestPortfolioStatsForDate = (req, res, next) => {
    DailyContest.getDailyContestPortfolioStatsForDate(req.swagger.params, res, next);
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

module.exports.getDailyContestPerformanceStats = (req, res, next) => {
    DailyContest.getDailyContestPerformanceStats(req.swagger.params, res, next);
};

module.exports.exitDailyContestPrediction = (req, res, next) => {
    DailyContest.exitDailyContestPrediction(req.swagger.params, res, next);
};

module.exports.getDailyContestOverallWinners = (req, res, next) => {
    DailyContest.getDailyContestOverallWinnersByEarnings(req.swagger.params, res, next);
}