'use strict';

const mongoose = require('./index');
const Schema = mongoose.Schema;
const EmbedThread = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },
    markdownText: {
        type: String,
        require: true
    },
    backtest: {
        type: Schema.Types.ObjectId,
        require: false,
        ref: 'Backtest'
    },
    createdAt: Date,
    updatedAt: Date
});

const Thread = new Schema({
    category: {
        type: String,
        require: true,
        enum: ['Share your idea', 'Questions and answers', 'News and announcements']
    },
    user: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },
    title: {
        type: String,
        require: true
    },
    backtest: {
        type: Schema.Types.ObjectId,
        require: false,
        ref: 'Backtest'
    },
    markdownText: {
        type: String,
        require: true
    },
    followers: [{
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    }],
    likes: [{
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    }],
    views: {
        type: Number,
        require: true,
        default: 0
    },
    lastCommentedUser: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },
    replies: [EmbedThread],
    createdAt: Date,
    updatedAt: Date
});

Thread.index({
    user: 1
}, {
    unique: false
});

// Thread.plugin(textSearch);
Thread.index({
    markdownText: 'text'
});

Thread.statics.saveReply = function(query, replyDetails) {
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                thread.replies.push(replyDetails);
                thread.updatedAt = new Date();
                thread.lastCommentedUser = replyDetails.user;

                return thread.save();
            }
        });
};

Thread.statics.saveThread = function(ThreadDetails) {
    const thread = new this(ThreadDetails);
    return thread.save();
};

Thread.statics.fetchThreads = function(query, options) {
    return this.find(query)
        .skip(options.skip)
        .limit(options.limit)
        .sort({
            [options.order_param]: options.order
        })
        .populate('replies.user', '_id firstName lastName').populate('user', '_id firstName lastName')
        .execAsync()
        .then((threads) => {
            return this.count(query)
                .then((count) => {
                    return {
                        threads: threads,
                        count: count
                    };
                });
        });
};

Thread.statics.fetchThread = function(query) {

    return this.findOne(query).populate('user', '_id firstName lastName').populate('backtest').populate('replies.user', '_id firstName lastName').populate('replies.backtest');
};


Thread.statics.getFollowers = function(query) {
    return this.find(query,{followers : 1})
        .populate('followers', '_id firstName lastName')
        .execAsync()
        .then((thread) => {
            return {
                thread: thread,
                count: thread[0].followers.length
            };
        });
};

Thread.statics.updateThreadFollowers = function(query, userId) {
    const id = userId.toString();
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                thread.followers.addToSet(id);
                return thread.save();
            }
        });
};

Thread.statics.updateThreadLikes = function(query, userId) {
    const id = userId.toString();
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                thread.likes.addToSet(id);
                return thread.save();
            }
        });
};

Thread.statics.updateViews = function(query) {
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                return thread.update({
                    $inc: {
                        views: 1
                    }
                });
                // return thread.save();
            }
        });
};

const ThreadModel = mongoose.model('Thread', Thread, 'Threads');
module.exports = ThreadModel;
