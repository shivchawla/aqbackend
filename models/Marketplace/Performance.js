/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:01
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-09-04 12:39:41
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;
const Portfolio = require('./Portfolio');
const PortfolioStats = require('./PortfolioStats');
const PerformanceMetrics = require('./PerformanceMetrics');

const Performance  = new Schema({ 
  	
  	portfolio:{
  		type: Schema.Types.ObjectId,
  		ref: 'Portfolio'
  	},

    lastUpdated: Date, 

    detail: Schema.Types.Mixed,
    
	portfolioStats: [{
		date: Date,
		netValue: Number,	
	}],

});

module.exports = Performance;
