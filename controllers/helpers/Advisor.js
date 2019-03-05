/*
* @Author: Shiv Chawla
* @Date:   2018-03-31 19:44:32
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-05 19:31:32
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const UserModel = require('../../models/user');
const config = require('config');
const _ = require('lodash');

module.exports.getAdminAdvisors = function() {
	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {_id:1})
	.then(users => {
		if(users) {
			var userIds = users.map(item => item._id); 
			return AdvisorModel.fetchAdvisors({user:{$in: userIds}}, {fields: '_id'});
		} else {
			return [];
		}
	});
};

module.exports.getAdminAdvisor = function(userId) {
	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {_id:1})
	.then(users => {
		if(userId && users && users.map(item => item._id.toString()).indexOf(userId.toString()) != -1) {
			return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'});
		} else {
			return null;
		}
	});
};

module.exports.updateAdvisorAccountCredit = function(advisorId, prediction) {
	return AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: 'account'})
	.then(advisor => {
		var investment = prediction.position.investment;
		var cashGenerated = prediction.position.avgPrice > 0 && prediction.position.lastPrice && _.get(prediction, 'triggered.status', true) ? (prediction.position.lastPrice/prediction.position.avgPrice)*investment : investment;

		var pnl = cashGenerated - investment;

		//SHORT COVER
		//Cash = 300
		//Liquid Cash = 100
		//Investment = -100
		//Short Cover or cash generated = -98 (pnl = 2)
		
		//=>

		//Cash = 300 - 98 = 202
		//Investment = 100 - 100 = 0 
		//Liquid Cash = 100 + 100 + 2 = 202
		
		//SELL LONG
		//Cash = 100
		//Liquid Cash = 100
		//Investment = 100
		//Sell Long Cash Genrated = 98 (pnl = -2)

		//=>

		//Cash = 100 + 98 = 198
		//Investment = 100 - 100 = 0 
		//Liquid Cash = 100 + 100 - 2 = 198

		const newAccount = {
			investment: _.get(advisor, 'account.investment', 0) - Math.abs(investment),
			liquidCash: _.get(advisor, 'account.liquidCash', 0) + Math.abs(investment) + pnl,
			cash: _.get(advisor, 'account.cash', 0) + cashGenerated,
		};

		return AdvisorModel.updateAdvisor({_id: advisorId}, {account: newAccount});
	});
};

module.exports.updateAdvisorAccountDebit = function(advisorId, predictions) {
	return AdvisorModel.fetchAdvisor({_id: advisorId}, {fields: 'account'})
	.then(advisor => {
		var investedCapital = 0;
			
		predictions.forEach(item => {
			investedCapital += _.get(item, 'position.investment', 0);	
		});

		//SHORT
		//Cash = 200
		//Liquid Cash = 200
		//Investment = -100
		
		//=>

		//Cash = 300
		//Liquid Cash = 100
		//Investment = 100


		//LONG
		//Cash = 200
		//Liquid Cash = 200
		//Investment = 100
		
		//=>

		//Cash = 100
		//Liquid Cash = 100
		//Investment = 100
		
		const newAccount = {
			investment: _.get(advisor, 'account.investment', 0) + Math.abs(investedCapital),
			liquidCash: _.get(advisor, 'account.liquidCash', 0) - Math.abs(investedCapital),
			cash: _.get(advisor, 'account.cash', 0) - investedCapital,
		};

		return AdvisorModel.updateAdvisor({_id: advisorId}, {account: newAccount});
	});
};

module.exports.fetchAdvisorsWithAllocation = function() {
	return AdvisorModel.fetchAdvisors({'allocation.status': true}, {limit:1000});
};



