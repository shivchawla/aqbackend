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