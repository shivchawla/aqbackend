'use strict';

const Thread = require('./ThreadService');
const User = require('./UserService');


module.exports.createThread = function createThread (req, res, next) {
    Thread.createThread(req.swagger.params, res, next);
};

module.exports.getThread = function (req, res, next) {
    Thread.getThread(req.swagger.params, res, next);
};

module.exports.listFollowers = function listFollowers (req, res, next) {
    Thread.listFollowers(req.swagger.params, res, next);
};

module.exports.getThreads = function(req, res, next) {
    Thread.getThreads(req.swagger.params, res, next);
};

module.exports.getThreadsDefault = function(req, res, next) {
    Thread.getThreadsDefault(req.swagger.params, res, next);
};

module.exports.followThread = function followThread (req, res, next) {
    Thread.followThread(req.swagger.params, res, next);
};

module.exports.addTagToThread = function addTagToThread (req, res, next) {
    Thread.addTagToThread(req.swagger.params, res, next);
};

module.exports.likeThread = function likeThread (req, res, next) {
    Thread.likeThread(req.swagger.params, res, next);
};

module.exports.replyToThread = function replyToThread (req, res, next) {
    Thread.replyToThread(req.swagger.params, res, next);
};

module.exports.viewThread = function viewThread (req, res, next) {
    Thread.viewThread(req.swagger.params, res, next);
};
