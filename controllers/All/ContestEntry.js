/*
* @Author: Shiv Chawla
* @Date:   2018-09-28 15:11:12
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-09-28 16:29:10
*/

'use strict';
const ContestEntry = require('../Marketplace/ContestEntryService');

module.exports.createContestEntry = function(req, res, next) {
    ContestEntry.createContestEntry(req.swagger.params, res, next);
};

module.exports.validateContesEntry = function(req, res, next) {
    ContestEntry.validateContestEntry(req.swagger.params, res, next);
};

module.exports.getContesEntries = function(req, res, next) {
    ContestEntry.getContestEntries(req.swagger.params, res, next);
};

module.exports.getContesEntrySummary = function(req, res, next) {
    ContestEntry.getContestEntrySummary(req.swagger.params, res, next);
};

module.exports.getAdvicePortfolio = function(req, res, next) {
    ContestEntry.getContestEntryPortfolio(req.swagger.params, res, next);
};

module.exports.getContestEntryHistory = function(req, res, next) {
    ContestEntry.getContestEntryHistory(req.swagger.params, res, next);
};

module.exports.updateContestEntry = function(req, res, next) {
    ContestEntry.updateContestEntry(req.swagger.params, res, next);
};