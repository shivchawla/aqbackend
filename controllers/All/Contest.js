'use strict';
const Contest = require('../Marketplace/ContestService');
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

module.exports.updateAdviceInContest = (req, res, next) => {
    Contest.updateAdviceInContest(req.swagger.params, res, next);
};

module.exports.updateContest = (req, res, next) => {
    Contest.updateContest(req.swagger.params, res, next);
};

module.exports.updateAllContestRanks = (req, res, next) => {
    ContestHelper.updateAllAnalytics();
};

module.exports.getContestEntryRankSummaryInLatestContest = (req, res, next) => {
    Contest.getContestEntryRankSummaryInLatestContest(req.swagger.params, res, next);
};

module.exports.getEntriesInContest = (req, res, next) => {
    Contest.getEntriesInContest(req.swagger.params, res, next);
};

module.exports.getContestEntryRankSummaryinAllContests = (req, res, next) => {
    Contest.getContestEntryRankSummaryinAllContests(req.swagger.params, res, next);
}

module.exports.getAllContests = (req, res, next) => {
    Contest.getAllContests(req.swagger.params, res, next);
}

module.exports.sendEmailToContestWinners = (req, res, next) => {
    Contest.sendEmailToContestWinners(req.swagger.params, res, next);
}