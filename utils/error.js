/*
* @Author: Shiv Chawla
* @Date:   2017-06-19 13:43:02
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-14 10:59:46
*/

'use strict';

function throwJsonError(obj) {
	//throw new Error(JSON.stringify(obj));
	Error(JSON.stringify(obj));
}

exports.throwJsonError = throwJsonError;