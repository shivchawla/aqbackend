'use strict';
const ThreadModel = require('../models/thread');
const BacktestModel = require('../models/backtest');

exports.createThread = function(args, res, next) {
    const user = args.user;
    const thread = {
        user: user._id,
        category: args.body.value.category,
        markdownText: args.body.value.markdownText,
        title: args.body.value.title,
        backtestId : args.body.value.backtestId,
        followers : [user._id],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    var backtestQuery = {_id : args.body.value.backtestId}

    ThreadModel.saveThread(thread)
        .then(function(threadSaved) {
            BacktestModel.updateBacktestUpdated(backtestQuery, {shared : true})
            .then(function(updateData){
                return res.status(200).json({_id : threadSaved._id});
            })
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
    const following = args.following.value;
    const category = args.category.value;
    const query = { };
    if (personal) {
        query.user = args.user._id;
    }
    if (following) {
        query.followers = {'$elemMatch':{'$eq': args.user._id }}
    }
    if(args.userId.value){
        query.followers = {'$elemMatch':{'$eq': args.userId.value}}
    }
    if(args.userId.value && following){
        query.followers = {'$elemMatch':{'$eq': args.user._id , '$eq': args.userId.value }}
    }
    if (text) {
        query.$text = {
            $search: text
        };
    }
    if(text){
        query.title = { "$regex": text, "$options": "i" }
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

exports.listFollowers = function(args, res, next) {
    const threadId = args.threadId.value;
    const skip = args.skip.value;
    const limit = args.limit.value;

    ThreadModel.getFollowers({
        _id: threadId
    }, limit, skip)
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
        return res.status(200).json(thread.followers);
    })
    .catch(err => {
        next(err);
    });
};

exports.addTagToThread = function(args, res, next) {
    const tag = args.tag.value;
    ThreadModel.updateTags({
        _id: args.threadId.value
    }, tag)
        .then(thread => {
        return res.status(200).json(thread.tags);
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
        backtestId : args.body.value.backtestId,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    var backtestQuery = {_id : args.body.value.backtestId}
    ThreadModel.saveReply({
        _id: args.threadId.value
    }, embedThread)
    .then(thread => {
        BacktestModel.updateBacktestUpdated(backtestQuery,{shared : true})
            .then(function(updateData){
                return res.status(200).json(thread);
            })
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
        return res.status(200).json(thread.views);
    })
    .catch(err => {
        next(err);
    });
};
