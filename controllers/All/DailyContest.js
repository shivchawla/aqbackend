/*
* @Author: Shiv Chawla
* @Date:   2018-09-07 17:54:30
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-08 13:57:20
*/

const DailyContest = require('../Marketplace/DailyContestService');


module.exports.createDailyContest = (req, res, next) => {
    DailyContest.createDailyContest(req.swagger.params, res, next);
};

module.exports.getDailyContest = (req, res, next) => {
    DailyContest.getDailyContest(req.swagger.params, res, next);
};

module.exports.getDailyContestEntry = (req, res, next) => {
    DailyContest.getDailyContestEntry(req.swagger.params, res, next);
};

module.exports.createDailyContestEntry = (req, res, next) => {
    DailyContest.createDailyContestEntry(req.swagger.params, res, next);
};

module.exports.updateDailyContestEntry = (req, res, next) => {
    DailyContest.updateDailyContestEntry(req.swagger.params, res, next);
};