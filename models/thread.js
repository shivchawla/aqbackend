'use strict';

const mongoose = require('./index');
const Schema = mongoose.Schema;
const Promise = require('bluebird');
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
    backtestId: {
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
        enum: ['Share your Idea', 'Questions and Answers', 'News and Announcements']
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
    backtestId: {
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
    tags: [{
        type: String,
        require: true
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
    markdownText: 'text',
    title: 'text'
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

Thread.statics.fetchThread = function(query, options) {
    
    try { 
        var queryM = {'_id': mongoose.Types.ObjectId(query._id)};
        //console.log(queryM);
    } catch(err) {
        console.log(err.message);
    }

    return Promise.all([
        //{replies: {$slice: [options.skip, options.limit]}}
        //SEND ALL REPLIES....FIX NEEDED ON UI
        this.findOne(query)
        .populate('user', '_id firstName lastName')
        .populate('replies.user','_id firstName lastName'),
             this.aggregate([{$match: queryM}, {$project: {count: {$size: '$replies'}}}])
        ])
        .then(([thread, ct]) => {
            try {
                var thread = thread.toJSON();
                if(ct.length > 0) {
                    thread["nreplies"] = ct[0].count;
                    console.log({thread: thread, nreplies:ct[0].count});
                    return thread;
                    //return {thread: thread, nreplies:ct[0].count};
                } else {
                    thread["nreplies"] = 0;
                    //console.log({thread: thread, nreplies:ct[0].count});
                    return thread;
                    //return {thread: thread, nreplies:0};
                }
            } catch(err) {
                console.log(err.message);
            } 
        });     
};


Thread.statics.getFollowers = function(query, limit, skip) {
    return this.find(query,{followers : 1}, { skip: skip, limit: limit })
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
                if(thread.followers.indexOf(id)== -1)
                    thread.followers.addToSet(id);
                else
                     thread.followers.pull(id);
                return thread.save();
            }
        });
};

Thread.statics.updateTags = function(query, tag) {
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                if(thread.tags.indexOf(tag)== -1)
                    thread.tags.addToSet(tag);
                else
                    thread.tags.pull(tag);
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
