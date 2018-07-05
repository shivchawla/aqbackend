'use strict';
const Contest = require('../Marketplace/ContestService');

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