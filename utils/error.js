/*
* @Author: Shiv Chawla
* @Date:   2017-06-19 13:43:02
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-06-19 13:45:02
*/

'use strict';

function throwJsonError(obj) {
	throw new Error(JSON.stringify(obj));
}

exports.throwJsonError = throwJsonError;