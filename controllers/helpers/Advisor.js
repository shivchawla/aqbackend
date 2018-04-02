/*
* @Author: Shiv Chawla
* @Date:   2018-03-31 19:44:32
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-31 19:46:01
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
		if(users && users.map(item => item._id.toString()).indexOf(userId.toString()) != -1) {
			return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'});
		} else {
			return null;
		}
	});
};

