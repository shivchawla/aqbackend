/*
* @Author: Shiv Chawla
* @Date:   2017-05-22 14:19:01
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-16 16:42:23
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
      metrics: [PerformanceMetrics],
      portfolioValues: [{date: Number, netValue: Number}]  
});

const Performance  = new Schema({  	
  	portfolio:{
  		type: Schema.Types.ObjectId,
  		ref: 'Portfolio'
  	},

    current: PerformanceDetail,

    simulated: PerformanceDetail,
});

Performance.statics.savePerformance = function(performanceDetail) {
    const performance = new this(performanceDetail);
    return performance.save();
};

Performance.statics.fetchPerformance = function(query, fields) {
    
    var q = this.find(query);

    if(fields) {
        q = q.select(fields)
    }

    return q.execAsync();
};

Performance.statics.updatePerformance = function(query, updates) {
    return this.findOneAndUpdate(query, updates, {upsert:true, new: true}).execAsync();
};

Performance.statics.updatePerformanceByType = function(query, latestPerformanceDetail, type) {
    return this.findOneAndUpdate(query, {}, {upsert:true, new: true})
    .then(performance => {
       if (performance) {

          if(!performance[type]) {
              performance[type] = {};
          }

          var performanceDetail = performance[type];
          var performanceDetailMetrics = performanceDetail.metrics ? performanceDetail.metrics : [];

          var latestPerformanceDetailMetrics = latestPerformanceDetail.metrics;
          var latestDate = latestPerformanceDetail.date;

          //find date in the current Performance Metrics
          var idx = performanceDetailMetrics.map(item => item.date).indexOf(latestDate);

          //Performance or input date is not present: INSERT
          if (idx == -1) {
              performanceDetailMetrics.push(latestPerformanceDetail.metrics);
          } else { //UPDATE
              Object.keys(latestPerformanceDetailMetrics).forEach(key => {
                  performanceDetailMetrics[idx][key] = latestPerformanceDetailMetrics[key];      
              });
          }

          //Update the portfolio Values 
          performanceDetail.portfolioValues = latestPerformanceDetail.portfolioValues;

          //Update the updateDate and updateMessage
          performanceDetail.updatedDate = latestPerformanceDetail.updatedDate;
          performanceDetail.updatedMessage = latestPerformanceDetail.updatedMessage;

          //Save the updated performance
          return performance.save();          
        }
    });
};

Performance.statics.addPerformance = function(query, latestPerformance) {
    return this.findOneAndUpdate(query, {}, {upsert:true, new: true})
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

                    var performanceDetailMetrics = performanceDetail.metrics ? performanceDetail.metrics : [];

                    var latestPerformanceDetailMetrics = latestPerformanceDetail.metrics;
                    var latestDate = latestPerformanceDetailMetrics.date;

                    //find date in the current Performance Metrics
                    var idx = performanceDetailMetrics.map(item => item.date.toString()).indexOf(latestDate.toString());

                    //Performance or input date is not present: INSERT
                    if (idx == -1) {
                        performanceDetailMetrics.push(latestPerformanceDetail.metrics);
                    } else { //UPDATE
                        Object.keys(latestPerformanceDetailMetrics).forEach(key => {
                            performanceDetailMetrics[idx][key] = latestPerformanceDetailMetrics[key];      
                        });
                    }

                    //Update the portfolio Values 
                    performanceDetail.portfolioValues = latestPerformanceDetail.portfolioValues;

                    //Update the updateDate and updateMessage
                    performanceDetail.updatedDate = latestPerformanceDetail.updatedDate;
                    performanceDetail.updatedMessage = latestPerformanceDetail.updatedMessage;
                }
            });

            //Save the updated performance
            return performance.save();          
        }
    });
};


//module.exports = Performance;
const PerformanceModel = mongoose.model('PortPerformance', Performance);
module.exports = PerformanceModel;