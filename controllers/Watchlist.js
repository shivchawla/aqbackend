/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:44:53
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-08-29 15:39:45
*/

'use strict';
const Watchlist = require('./WatchlistService');

module.exports.createWatchlist = function createWatchlist(req, res, next) {
    Watchlist.createWatchlist(req.swagger.params, res, next);
};

module.exports.getAllWatchlists = function getAllWatchlists(req, res, next) {
    Watchlist.getAllWatchlists(req.swagger.params, res, next);
};

module.exports.getWatchlist = function getWatchlist(req, res, next) {
    Watchlist.getWatchlist(req.swagger.params, res, next);
};

module.exports.updateWatchlist = function updateWatchlist(req, res, next) {
    Watchlist.updateWatchlist(req.swagger.params, res, next);
};

module.exports.deleteWatchlist = function deleteWatchlist(req, res, next) {
    Watchlist.deleteWatchlist(req.swagger.params, res, next);
};