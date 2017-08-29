'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const Security = require('./Security');

const Watchlist = new Schema({
    name: {
        type: String,
        require: true,
    },
    user: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'User'
    },
    type: {
        type: String,
        require: true
    },
    createdAt: Date,
    updatedAt: Date,
    
    deleted: {
        type: Boolean,
        default: false
    },

    deletedAt: Date,

    securities: [{updatedAt: Date, security: Security}],
});

Watchlist.index({
    user: 1,
    name: 1
});

Watchlist.statics.saveWatchlist = function(watchlistDetails) {
    const watchlist = new this(watchlistDetails);
    watchlist.createdAt = new Date();
    return watchlist.saveAsync();
};

Watchlist.statics.fetchWatchlist = function(query) {
    return this.findOne(query).execAsync();
};

Watchlist.statics.fetchAllWatchlists = function(query) {
    return this.find(query).execAsync();
};

Watchlist.statics.addWatchlist = function(query, security) {
    return this.findOne(query)
    .then(watchlist => {
        watchlist.securities.push(security);
        watchlist.updatedAt = new Date();
        return watchlist.save();
    });
};

Watchlist.statics.addWatchlist = function(query, securities) {
    return this.findOne(query)
    .then(watchlist => {
        watchlist.securities.append(securities);
        watchlist.updatedAt = new Date();
        return watchlist.save();
    });
};

Watchlist.statics.updateWatchlist = function(query, updates) {
    return this.findOne(query)
    .then(watchlist => {
        if (watchlist && !watchlist.deleted) {
            const keys = Object.keys(updates);
            keys.forEach(key => {
                watchlist[key] = updates[key];
            });
            watchlist.updatedAt = new Date();
            return watchlist.save();
        }
    });
};

Watchlist.statics.deleteWatchlist = function(query) {
    return this.findOne(query)
    .then(watchlist => {
        if(watchlist) {
            if(!watchlist.deleted) {
                watchlist.deleted = true;
                watchlist.deletedAt = new Date();
                return watchlist.save();
            } else {
                throw new Error("Watchlist already deleted");
            }
        } else {
            throw new Error("Watchlist not found");
        }
    });
};

const WatchlistModel = mongoose.model('Watchlist', Watchlist, 'watchlist');
module.exports = WatchlistModel;
