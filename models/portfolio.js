/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-02 12:20:36
*/

'use strict';
const Position = require('./Position');
const mongoose = require('./index');
const Schema = mongoose.Schema;
const Portfolio = new Schema({
	positions: [Position],
});

Portfolio.statics.createPortfolio = function(portfolio) {

}

//const PortfolioModel = mongoose.model('Portfolio', Portfolio);
//module.exports = PortfolioModel;
module.exports = Portfolio;
