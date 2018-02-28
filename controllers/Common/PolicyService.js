/*
* @Author: Shiv Chawla
* @Date:   2017-07-01 12:44:53
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-09-28 16:55:38
*/

var path = require("path");
var fs = require('fs');
const policyDir = "../documents/";

'use strict';
exports.getPolicy = function getPolicy(args, res, next) {

	var policyType = args.type.value;
	var fname = 'tnc.txt';

	if(policyType == 'privacy') {
		fname = 'privacy.txt'
	}

	try {
    	policyTxt = fs.readFileSync(path.resolve(path.join(__dirname, policyDir, fname)), 'utf8');
		return res.status(200).json({txt: policyTxt});
	} catch(err) {
		return res.status(400).send(err.message);
		next(err);
	}
};
