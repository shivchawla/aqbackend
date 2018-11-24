 const _ = require('lodash');
 db.dailycontestentryperformances_gz.find({}).map(item => {
     let pnlStats = item.pnlStats;
     pnlStats = pnlStats.map(pnlItem => {
         var keys = pnlItem.cumulative ? Object.keys(pnlItem.cumulative) : [];
         var pnlCumulative = {};
         keys.forEach(key => {
             //var pKey = key == "all" ? "total" : key;
             pnlCumulative[key] = {all:pnlItem.cumulative[key]};
         });
         return {
            date: pnlItem.date,
            detail: {
                cumulative: pnlCumulative,
                daily: pnlItem.daily
            }
         }
     });

     const newFormatOutput =  {
         contestEntry: item.contestEntry,
         pnlStats: pnlStats
     };

     return db.dailycontestentryperformances.insertOne(newFormatOutput);

 });

 db.dailycontestentryperformances_gz.find({}).map(item => {
     let pnlStats = item.pnlStats;
     pnlStats = pnlStats.map(pnlItem => {
        var cumulativeKeys = pnlItem.cumulative ? Object.keys(pnlItem.cumulative) : [];
        var dailyKeys = pnlItem.daily ? Object.keys(pnlItem.daily) : [];
        var pnlCumulative = {};
        var pnlDaily = {};
        cumulativeKeys.forEach(key => {
            pnlCumulative[key] = {all: Object.assign(pnlItem.cumulative[key], {net: pnlItem.cumulative[key].total})} ;
            delete pnlCumulative[key].all.total;
        });
        dailyKeys.forEach(key => {
            pnlDaily[key] = Object.assign(pnlItem.daily[key], {net: pnlItem.daily[key].total});
            delete pnlDaily[key].total;
        });

        return {
            date: pnlItem.date,
            detail: {
                cumulative: pnlCumulative,
                daily: pnlDaily
            }
         }
     });

     const newFormatOutput =  {
        contestEntry: item.contestEntry,
        pnlStats: pnlStats
    };

    return db.dailycontestentryperformances.insertOne(newFormatOutput);
 });