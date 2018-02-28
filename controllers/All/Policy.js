/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:44:53
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-28 10:51:39
*/

'use strict';
const Policy = require('../Common/PolicyService');

module.exports.getPolicy = function getPolicy(req, res, next) {
    Policy.getPolicy(req.swagger.params, res, next);
};
