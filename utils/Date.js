/*
* @Author: Shiv Chawla
* @Date:   2018-03-31 19:38:33
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-04-12 19:13:56
*/

module.exports.compareDates = function(date1, date2) {
	var t1 = new Date(date1).getTime();
	var t2 = new Date(date2).getTime();

	return (t1 < t2) ? -1 : (t1 == t2) ? 0 : 1;
};

//Return dateTime formatted to Current Date and Time as 5:30AM IST 
//Applies offset before formatting
module.exports.getLocalDate = function(dateTime, offset) {
	
	//Get time as supplied	
	var _d = dateTime ? new Date(dateTime) : new Date();

	if (offset){
		//Introduce offset
		_d.setHours(_d.getHours() - offset);
	}

	//Get datetime in IST time zone
	var _dtLocalStr = _d.toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
	
	//extract date in IST time zone
	var _dLocalStr = _dtLocalStr.split(",")[0]; //date in India
	var ymd = _dLocalStr.split("/").map(item => parseInt(item));

	//Create UTC date with offset Indian date and time as 12:30 PM (this can be mdinight too)
	//THe output in Indian machines will make it to IST 6 PM
	var _od = new Date(ymd[2], ymd[0]-1, ymd[1]);

	var offsetTZ = _od.getTimezoneOffset();
	if(offsetTZ != 0) {
		//offset on Indian machines in -330 minutes
		//add 330 minutes on local machines
		_od.setMinutes(_od.getMinutes() - offsetTZ); 
	}
	
	return _od;
};

//Return dateTime formatted to Current Date and Time as 5:30AM IST
module.exports.getDate = function(dateTime) {
	
	return exports.getLocalDate(dateTime, 0);
};

//Return dateTime formatted to Current Date and Time as 5:30AM IST
module.exports.getCurrentDate = function() {
	
	return exports.getDate(null);
};

module.exports.getCurrentMonthEnd = function() {
};

function _getLastMonday(date) {
	var daysPassedSinceLastMonday = date.getDay() - 1;
	daysPassedSinceLastMonday = daysPassedSinceLastMonday  < 0 ? 6 : daysPassedSinceLastMonday; 
	date.setDate(date.getDate() - daysPassedSinceLastMonday);
	return exports.getDate(date)
}

module.exports.getFirstMonday = function(offset) {
	//["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
	var currentDate = exports.getCurrentDate();

	if (offset == "1W" || offset == "1w") {
		var lastMonday = _getLastMonday(currentDate);
		var nextDate = lastMonday;
		nextDate.setDate(nextDate.getDate() + 7);
		return nextDate;
	} else if(offset == "2W" || offset == "2w") {
		var lastMonday = _getLastMonday(currentDate);
		var nextDate = lastMonday;
		nextDate.setDate(nextDate.getDate() + 14);
		return nextDate;
	} else if(offset == "1M" || offset == "1m") {
		var firstDateNextMonth = exports.getDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
		return exports.getLatestWeekday(firstDateNextMonth);
		//var lastMonday = _getLastMonday(firstDateNextMonth);
		
		//var nextDate = lastMonday;
		//nextDate.setDate(nextDate.getDate() + 7);
		//return nextDate;
	} else if(offset == "3M" || offset == "3m" || offset == "1Q" || offset == "1q") {
		var firstDateAfterThreeMonths = exports.getDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 1));
		return exports.getLatestWeekday(firstDateAfterThreeMonths);
		/*var lastMonday = _getLastMonday(firstDateAfterThreeMonths);
		var nextDate = lastMonday;
		nextDate.setDate(nextDate.getDate() + 7);
		return nextDate;*/
	} 
};

module.exports.getLatestWeekday = function(date) {
	date = !date ? exports.getCurrentDate() : date;

	var day = date.getDay();
	if (!(day == 0 || day == 6)){
		return exports.getDate(date);
	} else {
		exports.getNextWeekday(date);
	}
}

module.exports.getNextWeekday = function(date) {
	date = !date ? exports.getCurrentDate() : date;
	var day = date.getDay();

	if (day == 6) { //Saturday
		date.setDate(date.getDate() + 2);
	} else if (day == 5) { //Friday
		date.setDate(date.getDate() + 3);
	} else {
		date.setDate(date.getDate() + 1);
	}

	return exports.getDate(date);
};
