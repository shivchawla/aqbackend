'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;
const Security = require('./Security');

const Watchlist = new Schema({
    name: {
        type: String,
        required: true,
    },
    user: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    
    createdAt: Date,
    updatedAt: Date,
    
    deleted: {
        type: Boolean,
        default: false
    },

    deletedAt: Date,

    securities: [Security],
});

Watchlist.index({user: 1,name: 1}, {unique:true});

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

Watchlist.statics.addSecurity = function(query, security) {
    return this.findOne(query)
    .then(watchlist => {
        watchlist.securities.push(security);
        return watchlist.saveAsync();
    });
};

Watchlist.statics.addSecurities = function(query, securities) {
    return this.findOne(query)
    .then(watchlist => {
        watchlist.securities.append(securities);
        return watchlist.saveAsync();
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
            return watchlist.saveAsync();
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
                return watchlist.saveAsync();
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
