/*
* @Author: Shiv Chawla
* @Date:   2017-06-19 13:43:02
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-16 19:20:25
*/

'use strict';

module.exports.throwJsonError = function(obj) {
	throw exports.jsonError(obj);
};

module.exports.jsonError = function(obj) {
	return new Error(JSON.stringify(obj));	
};