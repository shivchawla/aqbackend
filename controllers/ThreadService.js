'use strict';
const ThreadModel = require('../models/thread');
exports.createThread = function(args, res, next) {
    const user = args.user;
    const thread = {
        user: user._id,
        category: args.body.value.category,
        markdownText: args.body.value.markdownText,
        title: args.body.value.title,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    ThreadModel.saveThread(thread)
        .then(function(threadSaved) {
            return res.status(200).json(threadSaved);
        })
        .catch(err => {
            next(err);
        });
};

exports.getThreads = function(args, res, next) {
    ThreadModel.fetchThread({})
      .then((threads) => {
          return res.status(200).json(threads);
      })
      .catch(err => {
          next(err);
      });
};

exports.getThread = function(args, res, next) {
    const threadId = args.threadId.value;
    ThreadModel.fetchThread({
        _id: threadId
    })
      .then((threads) => {
          return res.status(200).json(threads);
      })
      .catch(err => {
          next(err);
      });
};

exports.followThread = function(args, res, next) {
    const user = args.user;
    ThreadModel.updateThreadFollowers({
        _id: args.threadId.value
    }, user._id)
    .then(thread => {
        return res.status(200).json(thread);
    })
    .catch(err => {
        next(err);
    });
};

exports.likeThread = function(args, res, next) {
    const user = args.user;
    ThreadModel.updateThreadLikes({
        _id: args.threadId.value
    }, user._id)
    .then(thread => {
        return res.status(200).json(thread);
    })
    .catch(err => {
        next(err);
    });
};

exports.replyToThread = function(args, res, next) {
    const user = args.user;
    const embedThread = {
        user: user._id,
        markdownText: args.body.value.markdownText,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    ThreadModel.saveReply({
        _id: args.threadId.value
    }, embedThread)
    .then(thread => {
        return res.status(200).json(thread);
    })
    .catch(err => {
        next(err);
    });
};

exports.viewThread = function(args, res, next) {
    const user = args.user;
    ThreadModel.updateViews({
        _id: args.threadId.value
    }, user._id)
    .then(thread => {
        return res.status(200).json(thread);
    })
    .catch(err => {
        next(err);
    });
};
