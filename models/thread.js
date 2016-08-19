'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const EmbedThread = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },
    mardownText: {
        type: String,
        require: true
    },
    createAt: Date,
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
    mardownText: {
        type: String,
        require: true
    },
    followers: [{
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    }],
    views: {
        type: String,
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

Thread.statics.saveThread = function(ThreadDetails) {
    const thread = new this(ThreadDetails);
    return thread.save();
};

Thread.statics.fetchThread = function(query) {
    return this.findOne(query);
};

Thread.statics.updateThread = function(query, userId) {
    const id = userId.toString();
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                thread.followers.addToSet(id);
                return thread.save();
            }
        });
};

Thread.statics.updateCode = function(query, code) {
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                thread.code = code;
                return Thread.save();
            }
        });
};

Thread.statics.updatePassword = function(query, hash) {
    return this.findOne(query)
        .then(function(thread) {
            if (thread) {
                thread.password = hash;
                return Thread.save();
            }
        });
};

const ThreadModel = mongoose.model('Thread', Thread, 'Threads');
module.exports = ThreadModel;
