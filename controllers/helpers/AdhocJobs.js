/*
* @Author: Shiv Chawla
* @Date:   2019-01-04 09:50:36
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-22 21:01:00
*/

'use strict';
const _ = require('lodash');
const Promise = require('bluebird');
const moment = require('moment-timezone');
const schedule = require('node-schedule');
const config = require('config');

const uuid = require('uuid');
const hashUtil = require('../../utils/hashUtil');
const DateHelper = require('../../utils/Date');
const APIError = require('../../utils/error');
const WSHelper = require('./WSHelper');

const UserModel = require('../../models/user');

const serverPort = require('../../index').serverPort;

function updateUserJwtId(hash=false) {
	return UserModel.fetchUsers({},{_id:1}, {limit: 1000})
	.then(users => {
		return Promise.mapSeries(users, function(user) {
			return Promise.resolve()
			.then(() => {
				return hash ?  hashUtil.genHash(uuid.v4()) : (user.jwtId || 'jwtid'); 
			})
			.then(jwtId => {
				return UserModel.updateJwtId({_id: user._id}, jwtId);
			})
		});
	})
}









