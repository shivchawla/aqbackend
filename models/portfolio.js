/*
* @Author: Shiv Chawla
* @Date:   2017-02-24 13:59:21
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-03-09 12:09:21
*/

'use strict';
const Position = require('./Position');
const mongoose = require('./index');
const Schema = mongoose.Schema;
const Portfolio = new Schema({
	cash: {
		type: Number,
		default: 0
	},
	positions: [Position],
});

Portfolio.statics.createPortfolio = function(portfolio) {

}

//const PortfolioModel = mongoose.model('Portfolio', Portfolio);
//module.exports = PortfolioModel;
module.exports = Portfolio;



//1. Create a portfolio
//2. Send portfolio for validation (blocking request?? NO..
//	 2a. HTTP request to Node backend 
//	 2b. The request is then forwarded to Julia websocket server
//	 2c. The response comes via Julia -> Node -> UI (Websocket)
//						comes to UI via WS)
//3. In validation,
//	  3a. Test if portfolio has right securitues
//	  3b. Compute metrics and test it against AQ.
//	  3c. Basic Validation on the UI before sending to backend.	  		   