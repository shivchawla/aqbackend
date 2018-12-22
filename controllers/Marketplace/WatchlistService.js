
const WatchlistModel = require('../../models/Marketplace/Watchlist');
const _ = require('lodash');
const Promise = require('bluebird');
const config = require('config');
const APIError = require('../../utils/error');
const SecurityHelper = require("../helpers/Security");

_shortableSecurities = [];

SecurityHelper.getShortableUniverse()
.then(shortableUniverse => {
	_shortableSecurities = shortableUniverse;
})

function _checkIfValidSecurity(security) {
	return SecurityHelper.validateSecurity(security);
}

function _populateWatchlistDetail(watchlist) {
	return Promise.map(watchlist.securities, function(security) {
		return Promise.all([
			SecurityHelper.getStockLatestDetailByType(security, "RT"),
			SecurityHelper.getStockLatestDetailByType(security, "EOD")
		])
		.then(([detailRT, detailEOD]) => {

			var eodLatestDetail = _.get(detailEOD, 'latestDetail', {}); 
			var rtLatestDetail = _.get(detailRT, 'latestDetail', {});
			var shortable = _shortableSecurities.indexOf(security.ticker) != -1;
			
			return Object.assign(security, {realtime: rtLatestDetail, eod: eodLatestDetail, shortable});
		})
	})
	.then(detailForWatchlist => {
		return Object.assign(watchlist, {securities: detailForWatchlist});
	})
}

module.exports.createWatchlist = function(args, res, next) {
	const user = args.user;
	const values = args.body.value;
	let userId = user._id;
	const selectedUserId = _.get(args, 'userId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	if (isAdmin && selectedUserId !== null) {
		userId = selectedUserId
	}
    
    const watchlist = {
        name: values.name,
        user: userId,
        securities: values.securities,
        createdAt: new Date(),
        updatedAt: new Date(),
	};
	const watchlistName = values.name;
    const query = {name: {$regex: `^${watchlistName}$`, $options: "i"}, user: userId};

    const securities = values.securities;
    return Promise.map(securities, function(security) {
    	return _checkIfValidSecurity(security);
    })
    .then(flags => {
    	if (flags.indexOf(false) == -1 || length(flags) == 0) {
			return WatchlistModel.findOne(query)
    	} else {
    		var idx = flags.indexOf(false);
    		APIError.throwJsonError({security: securities[idx], message:"Security not found"});
    	}
	})
	.then(data => {
		if (data !== null) { // Watchlist already present
			const watchlistId = _.get(data, '_id', null);
			const undoDeleteQuery = {_id: watchlistId, user: userId};
			return WatchlistModel.undoDelete(undoDeleteQuery, {securities: watchlist.securities})
		} else {
			return WatchlistModel.saveWatchlist(watchlist);
		}
	})
    .then(watchlist => {
    	return res.status(200).json(watchlist);
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    })
};

module.exports.getAllWatchlists = function(args, res, next) {
	let userId = args.user._id;
	const selectedUserId = _.get(args, 'userId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	if (isAdmin && selectedUserId !== null) {
		userId = selectedUserId
	}
	var query = {user: userId, deleted: false};
	
	if(args.name && args.name.value) {
		query.name = args.name.value;
	} 

	return WatchlistModel.fetchAllWatchlists(query)
	.then(watchlists => {
		if(watchlists) {
			return Promise.mapSeries(watchlists, function(watchlist) {
				return _populateWatchlistDetail(watchlist.toObject());
			});
			
		} else {
			APIError.throwJsonError({user: userId, message:"Not authorized or not present"});
		}
	})
	.then(allWatchlistPopulatedWithDetail => {
		return res.status(200).send(allWatchlistPopulatedWithDetail);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

module.exports.getWatchlist = function(args, res, next) {
	let userId = args.user._id;
	const watchlistId = args.watchlistId.value;
	const selectedUserId = _.get(args, 'userId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	if (isAdmin && selectedUserId !== null) {
		userId = selectedUserId
	}

	return WatchlistModel.fetchWatchlist({_id: watchlistId, user: userId, deleted: false})
	.then(watchlist => {
		if(watchlist) {
			return _populateWatchlistDetail(watchlist.toObject());
		} else {
			APIError.throwJsonError({user: userId, watchlist: watchlistId, message:"Not authorized or not present"});
		}
	})
	.then(watchlistPopulatedWithDetail => {
		return res.status(200).send(watchlistPopulatedWithDetail);
	})
	.catch(err => {
		return res.status(400).send(err.message);
	})
};

module.exports.updateWatchlist = function(args, res, next) {
	let userId = args.user._id;
	const watchlistId = args.watchlistId.value;
	const selectedUserId = _.get(args, 'userId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	if (isAdmin && selectedUserId !== null) {
		userId = selectedUserId
	}

	const updates = args.body.value;
	const securities = updates.securities;

	return Promise.map(securities, function(security) {
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

module.exports.deleteWatchlist = function(args, res, next) {
	let userId = args.user._id;
	const selectedUserId = _.get(args, 'userId.value', null);
	const userEmail = _.get(args, 'user.email', null);
	const isAdmin = config.get('admin_user').indexOf(userEmail) !== -1;
	if (isAdmin && selectedUserId !== null) {
		userId = selectedUserId
	}
	console.log('User Id', userId);
	const watchlistId = args.watchlistId.value;

	return WatchlistModel.deleteWatchlist({_id: watchlistId, user: userId})
	.then(watchlist => {
		return res.status(200).json({_id: watchlistId, user: userId, msg: "Watchlist deleted"});
	})
	.catch(err => {
		return res.status(400).send(err.message);	
	})
};
