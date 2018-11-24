/*
* @Author: Shiv Chawla
* @Date:   2018-03-31 19:38:33
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-11-24 13:48:20
*/
const moment = require('moment-timezone');
const indiaTimeZone = "Asia/Kolkata";
const localTimeZone = moment.tz.guess();

function _isBeforeMarketClose() {
	return moment().isBefore(exports.getMarketClose());
}

function _isAfterMarketOpen() {
	return moment().isAfter(exports.getMarketOpen());
}

module.exports.getMarketOpen = function() {
	var cd = moment().tz(indiaTimeZone).format("YYYY-MM-DD");
	return moment.tz(`${cd} 09:30:00`, indiaTimeZone).tz(localTimeZone);
}

module.exports.getMarketClose = function() {
	var cd = moment().tz(indiaTimeZone).format("YYYY-MM-DD");
	return moment.tz(`${cd} 15:30:00`, indiaTimeZone).tz(localTimeZone);
}

module.exports.getMarketOpenHour = function() {
	return exports.getMarketOpen().get('hour');
}

module.exports.getMarketOpenMinute = function(){
	return exports.getMarketOpen().get('minute');
}

module.exports.getMarketCloseHour = function() {
	return exports.getMarketClose().get('hour');
}

module.exports.getMarketCloseMinute = function(){
	return exports.getMarketClose().get('minute');
}

module.exports.compareDates = function(date1, date2) {
	var t1 = exports.getDate(date1).getTime();
	var t2 = exports.getDate(date2).getTime();

	return (t1 < t2) ? -1 : (t1 == t2) ? 0 : 1;
};

module.exports.getLocalDatetime  = function(datetime) {
	
	var _d = moment.tz(new Date(), "Asia/Kolkata").format();

	//Get datetime in IST time zone
	var _dtLocalStr = _d.toLocaleString("en-US", {timeZone: "Asia/Kolkata"})
}

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

//Return dateTime formatted to Current Date and Time as 05:30:00 IST
module.exports.getDate = function(dateTime) {
	return (dateTime ? moment(dateTime) : moment()).tz(indiaTimeZone).set({hour:5, minute:30, second:0, millisecond:0}).toDate();
	//return exports.getLocalDate(dateTime, 0);
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
	date = !date ? exports.getCurrentDate() : exports.getDate(date);

	var day = date.getDay();
	if (!(day == 0 || day == 6)){
		return exports.getDate(date);
	} else {
		return exports.getNextWeekday(date);
	}
}

module.exports.getNextWeekday = function(date) {
	date = !date ? exports.getCurrentDate() : exports.getDate(date);
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

module.exports.getPreviousWeekday = function(date) {
	date = !date ? exports.getCurrentDate() : exports.getDate(date);
	var day = date.getDay();

	if (day == 1) { //Monday
		date.setDate(date.getDate() - 3);
	} else if (day == 0) { //Sunday
		date.setDate(date.getDate() - 2);
	} else {
		date.setDate(date.getDate() - 1);
	}

	return exports.getDate(date);
};

module.exports.formatDate = function(date) {
	date = !date ? exports.getCurrentDate() : exports.getDate(date); 
	
	var month = date.getMonth() + 1;
    return date.getFullYear()+"-"+(month < 10 ? `0${month}` : month)+"-"+date.getDate();    
};

module.exports.getDatesInWeek = function(date, offset=0) {
	
	var _md = moment(date).tz(indiaTimeZone);
	var week = _md.get('week');

	var dates = [];

	var _d = moment().day('Monday').week(week + offset);

	for (var i=0;i<=5;i++) {
		dates.push(moment(_d).add(i, 'days').toDate());
	}

	return dates;
};

module.exports.getPreviousNonHolidayWeekday = function(date, offset=1) {
	var prevWeekday = offset == 0  ? module.exports.getDate(date) : module.exports.getPreviousWeekday(date);
	
	do {
		let isHoliday = module.exports.isHoliday(prevWeekday);
		prevWeekday = isHoliday || offset > 1 ? module.exports.getPreviousNonHolidayWeekday(prevWeekday) : prevWeekday;
		offset--;
	} while (offset > 0) 

	return prevWeekday;
};

module.exports.getNextNonHolidayWeekday = function(date, offset = 1) {
	var nextWeekday = offset == 0  ? module.exports.getDate(date) : module.exports.getNextWeekday(date);
	
	do {
		let isHoliday = exports.isHoliday(nextWeekday);	
		nextWeekday = isHoliday || offset > 1 ? exports.getNextNonHolidayWeekday(nextWeekday) : nextWeekday;
		offset--;
	} while(offset > 0)

	return nextWeekday;
};

module.exports.getCurrentIndiaDateTime = function() {
	return moment.tz(new Date(), "Asia/Kolkata"); 
};

module.exports.isHoliday = function(date) {
	date = !date ? module.exports.getCurrentDate() : module.exports.getDate(date);
	return date.getDay() == 0 || date.getDay() == 6 || holidays.findIndex(item => {return moment(item).isSame(moment(date));}) !== -1;
};

module.exports.getMarketCloseDateTime = function(date) {
	var d = moment.tz(date, indiaTimeZone).format("YYYY-MM-DD"); 
	return moment.tz(d, localTimeZone).set({hour: exports.getMarketCloseHour(), minute: exports.getMarketCloseMinute(), second: 0, millisecond: 0});
};

module.exports.getMarketOpenDateTime = function(date) {
	var d = moment.tz(date, indiaTimeZone).format("YYYY-MM-DD"); 
	return moment.tz(d, indiaTimeZone).tz(localTimeZone).set({hour: exports.getMarketOpenHour(), minute: exports.getMarketOpenMinute(), second: 0, millisecond: 0});
};

module.exports.isMarketTrading = function() {
	if (!exports.isHoliday()) {
		return _isAfterMarketOpen() && _isBeforeMarketClose();
	}
};

module.exports.isMarketOpen = function() {
	if (!exports.isHoliday()) {
		return _isAfterMarketOpen();
	}
};

module.exports.isMarketClose = function() {
	if (!exports.isHoliday()) {
		return _isBeforeMarketClose();
	}
};


const holidays = [
	"2018-08-22",
	"2018-09-13",
	"2018-09-20",
	"2018-10-02",
	"2018-10-18",
	"2018-11-07",
	"2018-11-08",
	"2018-11-23",
	"2018-12-25"
].map(item => exports.getDate(item));

