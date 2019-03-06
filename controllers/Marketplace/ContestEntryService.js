'use strict';
const _ = require('lodash');
const UserModel = require('../../models/user');
const AdvisorModel = require('../../models/Marketplace/Advisor');
const InvestorModel = require('../../models/Marketplace/Investor');
const ContestEntryModel = require('../../models/Marketplace/ContestEntry');
const PortfolioModel = require('../../models/Marketplace/Portfolio');
const Promise = require('bluebird');
const config = require('config');
const PortfolioHelper = require("../helpers/Portfolio");
const PerformanceHelper = require("../helpers/Performance");
const SecurityHelper = require("../helpers/Security");
const ContestEntryHelper = require("../helpers/ContestEntry");
const ContestHelper = require("../helpers/Contest");
const APIError = require('../../utils/error');
const DateHelper = require('../../utils/Date');
const sendEmail = require('../../email');

//NOT IN USE
//NEEDS MORE CONTEMPLATION
function _getEffectiveContestEntryStartDate(selectedStartDate) {
	
	var currentDatetimeIndia = DateHelper.getCurrentIndiaDateTime();
	
	const weekday = currentDatetimeIndia.day();
	const isWeekDay = weekday > 0 && weekday < 6;

	var currentDate = DateHelper.getCurrentDate();

	let isHoliday = DateHelper.isHoliday(currentDate);
	
	if (currentDatetimeIndia.get('hour') < 12 && isWeekDay && !isHoliday) {
		return DateHelper.getCurrentDate();
	}

	return DateHelper.getNextNonHolidayWeekday();

	//TO BE FIXED LATER
	var currentDate = DateHelper.getCurrentDate();
	
	//THIS LOGIC IS OKAY FOR ADVICE BUT NOT FOR CONTEST ENTRY
	/*if (DateHelper.compareDates(selectedStartDate, currentDate) == 1) {
		return selectedStartDate;
	}*/
	
	return Promise.all([
		SecurityHelper.getStockLatestDetailByType({ticker: "NIFTY_50"}, "EOD"),
		SecurityHelper.getStockLatestDetailByType({ticker: "NIFTY_50"}, "RT")
	])
	.then(([eodLatestDetail, rtLatestDetail]) => {

		var eodDate = eodLatestDetail ? DateHelper.getDate(eodLatestDetail.Date) : null;
		var rtDate = rtLatestDetail ? DateHelper.getDate(rtLatestDetail.date) : null;

		//All of this logic breaksdown on a trading date but trading hasn't started yet 
		// in such a case, date will be lastDate
		if (rtDate && eodDate) {
			if (DateHelper.compareDates(rtDate, eodDate) == 1) {
				return rtDate;
			} else {
				return eodDate;
			}
		}

		if (rtDate) {
			return rtDate;
		}

		if (eodDate) {
			return eodDate;
		}

		//Default is current date
		return currentDate;
	});
};

function _findFirstValidPortfolio(entryId, date, attempts) {
	var nDate = DateHelper.getDate(date);
	nDate.setDate(nDate.getDate() + 1);

	return ContestEntryHelper.getContestEntryPortfolio(entryId, nDate)
	.then(portfolioForDate => {
		if (portfolioForDate && portfolioForDate.detail) {
			return portfolioForDate;
		} else {
			return attempts > 0 ? _findFirstValidPortfolio(entryId, nDate, attempts - 1) : null;	
		}
	});
}

//THIS WORKS FINE!!
module.exports.createContestEntry = function(args, res, next) {

	const userId = args.user._id;
	const contestEntry = args.body.value;

	var advisorId = '';
	let effectiveStartDate;

	//Any one can create a contest entry
	return AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true})
	.then(advisor => {
		if(advisor) {
			advisorId = advisor._id;
			return Promise.all([
				ContestEntryModel.fetchEntries({advisor: advisorId, deleted:false}, {fields:'_id name'}),
				_getEffectiveContestEntryStartDate(DateHelper.getDate(contestEntry.portfolio.detail.startDate))
			])
		} else {
			APIError.throwJsonError({message:"Advisor not found", errorCode: 1201});
		}
	})
	.then(([[entries, ct], effStartDate]) => {
		//Update effective start date (in portfolio as well)
		effectiveStartDate = effStartDate;
		contestEntry.portfolio.detail.startDate = effStartDate;

		if(entries.length < config.get('max_contest_entries_per_advisor')) {
			
			var dollarPosition =  _.get(contestEntry, 'portfolio.detail.positionType', 'shares') == 'notional';
			return ContestEntryHelper.validateContestEntry({current:contestEntry, old:""}, {dollarPosition: dollarPosition});
		} else {
			APIError.throwJsonError({advisorId: advisorId, message:"Contest entries limit exceed. Can't add more contest entries.", errorCode: 1109});
		}
	})
	.then(validity => {
		if(validity.valid) {
			return ContestEntryHelper.saveContestEntry(contestEntry, advisorId, effectiveStartDate, args.user);
		} else {
			APIError.throwJsonError({message: "Invalid contestEntry", detail: validity.detail, errorCode: 1108});
		}
	})
	.then(finalOutput => {
		return res.status(200).send(finalOutput);
	})
	.catch(err => {
		return res.status(400).send(err.message);
    });
};

//Work for preliminary validation
module.exports.validateContestEntry = function(args, res, next) {
	
	const contestEntry = _.get(args,'body.value', null);
	const operation = _.get(args,'operation.value', "create");
	const entryId = _.get(args, 'entryId.value', null);
	const userId = _.get(args, 'user._id', null);

	return Promise.resolve()
	.then(() => {
		if (operation == "update" && (!userId || !entryId)) {
			APIError.throwJsonError({mesage: "Can't validate for unknown user"});
		} else if(operation == "create" && entryId) {
			APIError.throwJsonError({mesage: "Invalid input entryId for create operation"});
		} else if (operation == "update" && userId) {
			return ContestEntryHelper.getContestEntryAccessStatus(entryId, userId)
			.then(accessStatus => {
				if (accessStatus.isOwner) {
					return ContestEntryModel.fetchEntry({_id: entryId}, {fields: 'portfolio', populate: 'portfolio benchmark'})
					.then(oldEntry => {
						return oldEntry.toObject();
					});
				} else {
					APIError.throwJsonError({message: "Not Authorized to update the entry"});
				}
			})
		} else {
			return null
		}
	})
	.then(oldContestEntry => {
		if (contestEntry) {
			var oldPositionType = _.get(oldContestEntry, 'portfolio.detail.positionType', 'shares');
			var newPositionType = _.get(contestEntry, 'portfolio.detail.positionType', 'shares');

			if (oldPositionType !== newPositionType && oldContestEntry){
				APIError.throwJsonError({message: "Inconsistent position types"})
			}

			return ContestEntryHelper.validateContestEntry({current: contestEntry, old: oldContestEntry}, {dollarPosition: newPositionType=='notional'});
		} else {
			APIError.throwJsonError({message:"Invalid input contest entry"});
		}	
	})
	.then(finalOutput => {
		return res.status(200).send(finalOutput);
	})
	.catch(err => {
		return res.status(400).send(err.message);
    });
};

//WORKS
module.exports.updateContestEntry = function(args, res, next) {

	const entryId = args.entryId.value;
	const userId = args.user._id;
	const newContestEntry = args.body.value;
	
	let contestEntryPortfolioId;
	let nextValidDate;

	var contestEntryFields = 'advisor portfolio name';

	return Promise.all([
		AdvisorModel.fetchAdvisor({user: userId, isMasterAdvisor: true}, {fields: '_id'}),
		ContestEntryModel.fetchEntry({_id: entryId, deleted: false}, {fields: contestEntryFields, populate: 'portfolio'})
	])
	.then(([advisor, oldContestEntry]) => {

		if(advisor && oldContestEntry) {
			if(contestEntry.advisor.equals(advisor._id)) {

				let allowedKeys = ['portfolio'];

				Object.keys(newContestEntry).forEach(key => {
					if (allowedKeys.indexOf(key) === -1) {
						delete newContestEntry[key];
					}
				});

				if (Object.keys(newContestEntry).indexOf["portfolio"] != -1) {
					var newStartDate = _getEffectiveContestEntryStartDate();  
					nextValidDate = newStartDate;
				}

				contestEntryPortfolioId = oldContestEntry.portfolio._id;

				var oldPositionType = _.get(oldContestEntry, 'portfolio.detail.positionType', 'shares');
				var newPositionType = _.get(newContestEntry, 'portfolio.detail.positionType', 'shares');

				if (oldPositionType !== newPositionType && oldContestEntry){
					APIError.throwJsonError({message: "Inconsistent position types"})
				}

				return ContestEntryHelper.validateContestEntry({current: newContestEntry, old: oldContestEntry.toObject()}, {dollarPosition: newPositionType=='notional'});
			
			} else {
				APIError.throwJsonError({message: "Advisor not authorized to update", errorCode: 1107});
			}
		} else {
			APIError.throwJsonError({userId:userId, entryId: entryId, message: "Contest Entry not found", errorCode: 1101});
		}
	})
	.then(validContestEntry => {
		var contestEntryUpdates = Object.assign({}, newContestEntry);
		
		delete contestEntryUpdates.portfolio;

		if (validContestEntry.valid) {
			var copyPortfolio = Object.assign({}, newContestEntry.portfolio);
			copyPortfolio.detail.startDate = nextValidDate;

			return PortfolioModel.updatePortfolio({_id: contestEntryPortfolioId}, copyPortfolio, {new:true, fields: 'detail', appendHistory: true});
		} else {
			APIError.throwJsonError({message: "Invalid Contest Entry", detail: validContestEntry.detail, errorCode: 1108});
		}
	})
	.then(updatedPortfolio => {
		return res.status(200).send("Contest entry updated successfully");
	})	
	.catch(err => {
		return res.status(400).json(err.message);	
	})
};

//WORKS
module.exports.getContestEntries = function(args, res, next) {

	const userId = _.get(args, 'user._id', null);
    const options = {};
	options.skip = args.skip.value;
    options.limit = args.limit.value;
 
    options.fields = 'name createdDate updatedDate advisor prohibited performanceSummary rating startDate';

	var query = {deleted: false};
	
    //You should only be able to see personal entries if contestOnly is true
    const personal = args.personal.value;
	const advisorId = args.advisor.value;
	
   	let userInvestorId;
   	let userAdvisorId;
   	let isUserAdmin;

   	let count;
    return Promise.all([
    	userId ? AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true}) : null,
		userId ? InvestorModel.fetchInvestor({user:userId}, {fields: '_id', insert: true}) : null,
		userId ? UserModel.fetchUsers({email:{'$in': config.get('admin_user')}}, {_id:1}) : []
	])
    .then(([advisor, investor, admins]) => {
    	
		if (userId && admins && admins.map(item => item._id.toString()).indexOf(userId.toString()) !=-1) {
			isUserAdmin = true;
		}

    	userAdvisorId = advisor ? advisor._id : null;
    	userInvestorId = investor ? investor._id : null; 

	    var advisorQuery = [];
	    if(!advisorId) {
			var personalCategories = personal ? personal.split(",") : ["0","1"];
	 		
	    	if (personalCategories.indexOf("1") !=-1) {
	    		advisorQuery.push({advisor: userAdvisorId});
	    	}

	    	if (personalCategories.indexOf("0") !=-1) {
	    		//Only show advices starting after today for other advisors
	    		let q = {};
	    		if (!isUserAdmin) {
	    			q = {'latestApproval.status': true};
	    		}

	    		advisorQuery.push({$and: [Object.assign(q, {advisor:{'$ne': userAdvisorId}, public: true, prohibited: false}), 
	    								{$or:[{startDate: {$lte: DateHelper.getCurrentDate()}}, 
    								      	{startDate: {$exists: false}}
								      	]}
						      		]});
	    		
	    	}

	    	query = {'$and': [query, {'$or': advisorQuery}]}
	    } 
	    else if(advisorId) {
	    	query.advisor = advisorId;
	    	if (!userAdvisorId.equals(advisorId)) {
	    		query.public = true;
	    		query.prohibited = false;	

	    		query = {$and: [query, {'latestApproval.status':true},
							{$or:[{startDate: {$lte: DateHelper.getCurrentDate()}}, 
						      	{startDate: {$exists: false}}
					      	]}
				      	]};
	    	}
	    }

    	return ContestEntryModel.fetchEntries(query, options);
	})
    .then(([entries, ct]) => {
    	if(entries) {
    		count = ct;
	    	return Promise.map(entries, function(entry) {
    			let entryId = entry._id;
    			return Promise.all([
    				ContestEntryHelper.getContestEntryPnlStats(entryId),
    				ContestHelper.getContestEntrySummary(entryId)
				])
    			.then(([contestEntryPnlStats, contestDetails]) => {
    				return Object.assign(contestEntryPnlStats, {contest: contestDetails}, entry.toObject());
    			});
			});
		} else {
			APIError.throwJsonError({message: "No entries found", errorCode: 1110});
		}
    })
    .then(updatedEntries => {
    	return res.status(200).send({entries: updatedEntries, count: count});	
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};

//WORKS
module.exports.getContestEntrySummary = function(args, res, next) {
	const entryId = args.entryId.value;
	const userId = args.user ? args.user._id : null;
	const fullperformanceFlag = args.fullperformance.value;
	
	const options = {};
	options.fields = 'name createdDate updatedDate advisor prohibited portfolio rating';
	options.populate = 'advisor benchmark';
	
	return ContestEntryModel.fetchEntry({_id: entryId, deleted: false}, options)
 	.then(contestEntry => {
 		let nContestEntry; 
 		if(contestEntry) {
			//First fetch the latest portfolio for the entry
			//and compute performance of the same
			return _findFirstValidPortfolio(entryId, DateHelper.getCurrentDate(), 100)
			.then(firstValidPortfolio => {
				var date = DateHelper.getCurrentDate();
				if (firstValidPortfolio && firstValidPortfolio.detail) {
					date = DateHelper.getDate(firstValidPortfolio.detail.startDate);
				}

				return Promise.all([
					contestEntry,
					ContestEntryHelper.getContestEntryPnlStats(entryId, date),
					fullperformanceFlag ? PerformanceHelper.getContestEntryPerformance(entryId, date, userId) : PerformanceHelper.getContestEntryPerformanceSummary(entryId, date)
				]);	
			});
		} else {
			APIError.throwJsonError({message:'Contest entry not found', errorCode: 1101});
		}
 	})
 	.then(([contestEntry, contestEntryPnlStats, performance]) => {
		var nContestEntry;

		if (fullperformanceFlag && performance) {
			const pf = performance.toObject();
			nContestEntry = Object.assign({performanceSummary: pf.summary, performance: pf}, contestEntryPnlStats, contestEntry.toObject());
		}
 		else if (!fullperformanceFlag && performance) {
			nContestEntry = Object.assign({performanceSummary: performance}, contestEntryPnlStats, contestEntry.toObject());
		}

		return res.status(200).send(nContestEntry);
 	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });   
};

/*
* Function to get contest entry portfolio for a date
* Updated portfolio contains latest price (and/or average price in case of owner)
*/
module.exports.getContestEntryPortfolio = function(args, res, next) {
	const entryId = args.entryId.value;
	const userId = args.user._id;
	const date = args.date.value;
	const history = _.get(args, 'history.value', false);

	let ndate;
	return ContestEntryHelper.isUserAuthorizedToViewContestEntryDetail(entryId, userId)
	.then(authorizationStatus => {
		if(authorizationStatus.authorized) {
			ndate = !date || date == '' ? DateHelper.getCurrentDate() : DateHelper.getDate(date); 
			
			if (history) {
				let contestEntryHistory;
				return ContestEntryHelper.getContestEntryPortfolioHistory(entryId)
				.then(history => {
					contestEntryHistory = history;
					return PortfolioHelper.getContestEntryTransactions(history)
				})
				.then(transactions => {
					return {history: contestEntryHistory, transactions: transactions};
				})
			} else {
				//Re-run the query after checking 
				return ContestEntryHelper.getContestEntryPortfolio(entryId, {populateAvg: authorizationStatus.isOwner || authorizationStatus.isAdmin}, ndate)
				.then(portfolioForDate => {
					if (portfolioForDate && portfolioForDate.detail) {
						return portfolioForDate;
					} else {
						return authorizationStatus.isOwner ? _findFirstValidPortfolio(entryId, ndate, 100) : null; 
					}
				})
			}
		} else {
			APIError.throwJsonError({message:"Investor not authorized to view contest entry detail", errorCode: 1112});
		}
	})
	.then(updatedPortfolio => {
		return res.status(200).send(Object.assign({entryId: entryId}, updatedPortfolio));
	})
 	.catch(err => {
    	return res.status(400).send(err.message);
    });
};
