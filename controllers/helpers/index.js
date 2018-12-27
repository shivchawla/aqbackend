/*
* @Author: Shiv Chawla
* @Date:   2017-05-10 13:06:04
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-27 16:41:32
*/

'use strict';
const AdvisorModel = require('../../models/Marketplace/Advisor');
const PerformanceModel = require('../../models/Marketplace/Performance');
const UserModel = require('../../models/user');
const SecurityPerformanceModel = require('../../models/Marketplace/SecurityPerformance');
const APIError = require('../../utils/error');
const config = require('config');
const WebSocket = require('ws'); 
const Promise = require('bluebird');
var ObjectId= require('mongoose').Types.ObjectId;

function _compareIds(x, y) {
	if(!x && !y) {
		return true;
	} else if(!x || !y) {
		return false;
	} else {
		return x.equals(y);
	}
}

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
		if(users && users.map(item => item._id.toString()).indexOf(userId.toString()) != -1) {
			return AdvisorModel.fetchAdvisor({user: userId}, {fields: '_id'});
		} else {
			return null;
		}
	});
};

