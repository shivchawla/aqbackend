/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:01
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-23 18:17:13
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

    analytics: Schema.Types.Mixed,
    
  	portfolioValues: [{
  		date: Number,
  		netValue: Number,	
  	}],

});

Performance.statics.savePerformance = function(performanceDetail) {
    const performance = new this(performanceDetail);
    return performance.save();
};

Performance.statics.fetchPerformance = function(query) {
    return this.find(query).execAsync();
};

Performance.statics.updatePerformance = function(query, updates) {
    return this.findOneAndUpdate(query, updates, {upsert:true, new: true}).execAsync();
};

//module.exports = Performance;
const PerformanceModel = mongoose.model('PortPerformance', Performance);
module.exports = PerformanceModel;