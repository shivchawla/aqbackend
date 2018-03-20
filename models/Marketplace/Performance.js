/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:01
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-20 15:06:07
*/

'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;
const Portfolio = require('./Portfolio');

const PerformanceMetrics = new Schema({
    date: Date,
    portfolioComposition: Schema.Types.Mixed,
    constituentPerformance: Schema.Types.Mixed,
    portfolioPerformance: Schema.Types.Mixed
});

const PerformanceDetail = new Schema({
      updateDate: Date,
      updateMessage: String,
      metrics: PerformanceMetrics,
      portfolioValues: [{date: Date, netValue: Number}]  
});

const Performance  = new Schema({  	
  	portfolio:{
  		type: Schema.Types.ObjectId,
  		ref: 'Portfolio',
      required: true
  	},

    summary: Schema.Types.Mixed,

    current: PerformanceDetail,

    simulated: PerformanceDetail,
});

Performance.statics.savePerformance = function(performanceDetail) {
    const performance = new this(performanceDetail);
    return performance.saveAsync();
};

Performance.statics.fetchPerformance = function(query, fields) {
    
    var options = {upsert: true, new:true};
    
    if(fields) {
        options.fields = fields;
    }

    return this.findOneAndUpdateAsync(query, {}, options);
};

Performance.statics.updatePerformance = function(query, updates, options) {
    return this.findOneAndUpdateAsync(query, updates, Object.assign(options ? options : {}, {upsert:true, new: true}))
};

Performance.statics.updatePerformanceByType = function(query, latestPerformanceDetail, type) {
    return this.findOneAndUpdateAsync(query, {}, {upsert:true, new: true})
    .then(performance => {
       if (performance) {

          if(!performance[type]) {
              performance[type] = {};
          }

          var performanceDetail = performance[type];
          //var performanceDetailMetrics = performanceDetail.metrics ? performanceDetail.metrics : {};

          var latestPerformanceDetailMetrics = latestPerformanceDetail.metrics;
          //var latestDate = new Date(latestPerformanceDetailMetrics.date);

          //find date in the current Performance Metrics
          //var idx = performanceDetailMetrics.map(item => item.date.getTime()).indexOf(latestDate.getTime());

          //Performance or input date is not present: INSERT
         // if (idx == -1) {
         //     performanceDetailMetrics.push(latestPerformanceDetailMetrics);
         // } else { //UPDATE
              //Object.keys(latestPerformanceDetailMetrics).forEach(key => {
              //    performanceDetailMetrics[key] = latestPerformanceDetailMetrics[key];      
              //});
          //}

          performanceDetail.metrics = latestPerformanceDetailMetrics;
          
          //Update the portfolio Values 
          performanceDetail.portfolioValues = latestPerformanceDetail.portfolioValues;

          //Update the updateDate and updateMessage
          performanceDetail.updatedDate = latestPerformanceDetail.updatedDate;
          performanceDetail.updatedMessage = latestPerformanceDetail.updatedMessage;

          //Save the updated performance
          return performance.saveAsync();          
        }
    });
};

Performance.statics.addPerformance = function(query, latestPerformance) {
    return this.findOneAndUpdateAsync(query, {}, {upsert:true, new: true})
    .then(performance => {
        if (performance) {
            var types = ["current", "simulated"];

            types.forEach(type => {
                if(!performance[type]) {
                    performance[type] = {};
                }

                var performanceDetail = performance[type];
                var latestPerformanceDetail = latestPerformance[type];

                if (latestPerformanceDetail) {

                    //var performanceDetailMetrics = performanceDetail.metrics ? performanceDetail.metrics : {};

                    var latestPerformanceDetailMetrics = latestPerformanceDetail.metrics;
                    //var latestDate = new Date(latestPerformanceDetailMetrics.date);

                    //find date in the current Performance Metrics
                    //var idx = performanceDetailMetrics.map(item => item.date.getTime()).indexOf(latestDate.getTime());

                    //Performance or input date is not present: INSERT
                    //if (idx == -1) {
                        //performanceDetailMetrics.push(latestPerformanceDetail.metrics);
                    //} else { //UPDATE
                        //Object.keys(latestPerformanceDetailMetrics).forEach(key => {
                        //    performanceDetailMetrics[key] = latestPerformanceDetailMetrics[key];      
                        //});
                    //}

                    performanceDetail.metrics = latestPerformanceDetailMetrics;

                    //Update the portfolio Values 
                    performanceDetail.portfolioValues = latestPerformanceDetail.portfolioValues;

                    //Update the updateDate and updateMessage
                    performanceDetail.updatedDate = latestPerformanceDetail.updatedDate;
                    performanceDetail.updatedMessage = latestPerformanceDetail.updatedMessage;
                }
            });

            //Save the updated performance
            return performance.saveAsync();          
        }
    });
};


//module.exports = Performance;
const PerformanceModel = mongoose.model('PortPerformance', Performance);
module.exports = PerformanceModel;