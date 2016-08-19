'use strict';
const ThreadModel = require('../models/thread');
exports.createThread = function(args, res, next) {
    const user = args.user;
    const thread = {
        user: user._id,
        category: args.body.value.category,
        markdownText: args.body.value.markdown,
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

exports.followThread = function(args, res, next) {
    const user = args.user;
    ThreadModel.updateThread({
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
    /**
     * parameters expected in the args:
     * threadId (String)
     * body (UserId)
     **/
    // no response value expected for this operation
    res.end();
}

exports.replyToThread = function(args, res, next) {
    /**
     * parameters expected in the args:
     * threadId (String)
     * body (Thread)
     **/
    // no response value expected for this operation
    res.end();
}

exports.viewThread = function(args, res, next) {
    /**
     * parameters expected in the args:
     * threadId (String)
     * body (UserId)
     **/
    // no response value expected for this operation
    res.end();
}
