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
    const skip = args.skip.value;
    const limit = args.limit.value;
    const order = args.order.value;
    const text = args.q.value;
    const order_param = args.order_param.value;
    const personal = args.personal.value;
    const category = args.category.value;
    const query = { };
    if (personal) {
        query.user = args.user._id;
    }
    if (text) {
        query.$text = {
            $search: text
        };
    }
    if (category) {
        query.category = category;
    }
    const options = {};
    options.limit = limit;
    options.skip = skip;
    options.order_param = order_param || 'createdAt';
    options.order = order || 1;

    ThreadModel.fetchThreads(query, options)
      .then((threads) => {
          return res.status(200).send(threads);
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
