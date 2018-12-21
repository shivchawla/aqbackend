/*
* @Author: Shiv Chawla
* @Date:   2018-03-31 19:44:32
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-21 17:38:54
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const UserModel = require('../../models/user');
const config = require('config');

module.exports.getAdminAdvisors = function() {
	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {fields:'_id'})
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
	return UserModel.fetchUsers({email:{'$in':config.get('admin_user')}}, {fields:'_id'})
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
		var cashGenerated = prediction.position.avgPrice > 0 ? (prediction.position.lastPrice/prediction.position.avgPrice)*prediction.position.investment : 0;

		const newAccount = {
			investment: _.get(advisor, 'account.investment', 0) - prediction.position.investment * 1000,
			liquidCash: _.get(advisor, 'account.liquidCash', 0) + cashGenerated,
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
			investedCapital += _.get(item, 'position.investment', 0) * 1000;	
		});

		const newAccount = {
			investment: _.get(advisor, 'account.investment', 0) + investedCapital,
			liquidCash: _.get(advisor, 'account.liquidCash', 0) - investedCapital,
			cash: _.get(advisor, 'account.cash', 0) - investedCapital,
		};

		return AdvisorModel.updateAdvisor({_id: advisorId}, {account: newAccount});
	});
};