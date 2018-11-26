/*
* @Author: Shiv Chawla
* @Date:   2018-11-25 12:39:47
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-26 09:31:10
*/

db.dailycontestentryperformances.renameCollection("dailycontestentryperformances_original");
db.dailycontestentries.renameCollection("dailycontestentries_original");

db.dailycontestentries_original.find({}).map(entry => {
	var advisorId = entry.advisor;
	var allStartDates = entry.predictions.map(item => { 
			var d = new Date(item.startDate); 
			d.setHours(11); 
			d.setMinutes(0); 
			d.setSeconds(0); 
			d.setMilliseconds(0); 
			return d.getTime();
		});

	let uniqueStartDates = [...new Set(allStartDates)].map(item => new Date(item)); 
	
	uniqueStartDates.map(date => {
		var predictionsForDate = entry.predictions.filter(item => {
			var d = new Date(item.startDate); 
			d.setHours(11); 
			d.setMinutes(0); 
			d.setSeconds(0); 
			d.setMilliseconds(0); 
			return d.getTime() == date.getTime();
		});
		
		return db.dailycontestentries.insert({advisor: advisorId, date: date, predictions: predictionsForDate})

	});

	return 1; 
});
