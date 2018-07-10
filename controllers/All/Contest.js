'use strict';
const Contest = require('../Marketplace/ContestService');
const AnalyticsHelper = require('../helpers/Analytics');
const ContestHelper = require('../helpers/Contest');

module.exports.createContest = (req, res, next) => {
    Contest.createContest(req.swagger.params, res, next);
};

module.exports.getContests = (req, res, next) => {
    Contest.getContests(req.swagger.params, res, next);
};

module.exports.getContest = (req, res, next) => {
    Contest.getContestSummary(req.swagger.params, res, next);
};

module.exports.modifyAdviceInContest = (req, res, next) => {
    Contest.modifyAdviceInContest(req.swagger.params, res, next);
};

module.exports.updateRanking = (req, res, next) => {
    Contest.updateRanking(req.swagger.params, res, next);
};

module.exports.updateContest = (req, res, next) => {
    Contest.updateContest(req.swagger.params, res, next);
};

module.exports.updateAllContestRanks = (req, res, next) => {
    ContestHelper.updateAllAnalytics();
}