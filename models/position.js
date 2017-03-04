/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-02 12:18:50
*/

'use strict';
const Security = require('./Security')

const mongoose = require('./index');
const Schema = mongoose.Schema;

const Position = new Schema({
	security: {
		type: Security
	},

	quantity: {
		type: Number,
		require: true,
		default: 0,
	},

	price: {
		type: Number,
	},

	date: Date,
});

//const PositionModel = mongoose.model('Position', Position);
//module.exports = PositionModel;
module.exports = Position;