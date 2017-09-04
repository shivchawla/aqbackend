
const WatchlistModel = require('../models/Marketplace/Watchlist');
const Promise = require('bluebird');
const APIError = require('../utils/error');

function _checkIfValidSecurity(security) {
	return true;
}

exports.createWatchlist = function(args, res, next) {
	const user = args.user;
    const values = args.body.value;
    
    const watchlist = {
        name: values.name,
        user: user._id,
        securities: values.securities,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const securities = values.securities;
    Promise.map(securities, function(security) {
    	return _checkIfValidSecurity(security);})
    .then(flags => {
    	if (flags.indexOf(false) == -1) {
    		return WatchlistModel.saveWatchlist(watchlist);
    	} else {
    		var idx = flags.indexOf(false);
    		APIError.throwJsonError({security: securities[idx], message:"Security not found"});
    	}
    })
    .then(watchlist => {
    	return res.status(200).json(watchlist);
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    })
};

exports.getAllWatchlists = function(args, res, next) {
	const userId = args.user._id;
	var query = {user: userId, deleted: false};
	
	if(args.name && args.name.value) {
		query.name = args.name.value;
	} 

	WatchlistModel.fetchAllWatchlists(query)
	.then(watchlists => {
		if(watchlists) {
			return res.status(200).json(watchlists);
		} else {
			APIError.throwJsonError({user: userId, message:"Not authorized or not present"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

exports.getWatchlist = function(args, res, next) {
	const userId = args.user._id;
	const watchlistId = args.watchlistId.value;

	WatchlistModel.fetchWatchlist({_id: watchlistId, user: userId, deleted: false})
	.then(watchlist => {
		if(watchlist) {
			return res.status(200).json(watchlist);
		} else {
			APIError.throwJsonError({user: userId, watchlist: watchlistId, message:"Not authorized or not present"});
		}
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

exports.updateWatchlist = function(args, res, next) {
	const userId = args.user._id;
	const watchlistId = args.watchlistId.value;

	const updates = args.body.value;
	const securities = updates.securities;

	Promise.map(securities, function(security) {
    	return _checkIfValidSecurity(security);
    })
    .then(flags => {
    	if(flags.indexOf(false) == -1) {
			return WatchlistModel.updateWatchlist({_id: watchlistId, user: userId}, updates)
		} else {
			var idx = flags.indexOf(false);
    		APIError.throwJsonError({security: securities[idx], message:"Security not found"});
		}
	})
 	.then(watchlist => {
    	return res.status(200).json(watchlist);
    })
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

exports.deleteWatchlist = function(args, res, next) {
	const userId = args.user._id;
	const watchlistId = args.watchlistId.value;

	WatchlistModel.deleteWatchlist({_id: watchlistId, user: userId})
	.then(watchlist => {
		return res.status(200).json({_id: watchlistId, user: userId, msg: "Watchlist deleted"});
	})
	.catch(err => {
		return res.status(400).send(err.message);	
	})
};
