/*
* @Author: Shiv Chawla
* @Date:   2018-03-31 19:38:33
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-27 14:52:12
*/
const moment = require('moment-timezone');
const indiaTimeZone = "Asia/Kolkata";
const localTimeZone = moment.tz.guess();


function _isBeforeMarketClose(minuteOffset = 0) {
	return moment.utc().isBefore(exports.getMarketClose().subtract(minuteOffset, 'minutes'));
}

function _isAfterMarketOpen(minuteOffset = 0) {
	return moment.utc().isAfter(exports.getMarketOpen().add(minuteOffset, 'minutes'));
}

module.exports.getMarketOpen = function() {
	var cd = moment().tz(indiaTimeZone).format("YYYY-MM-DD");
	return moment.tz(`${cd} 09:15:00`, indiaTimeZone).utc();
}

module.exports.getMarketClose = function() {
	var cd = moment().tz(indiaTimeZone).format("YYYY-MM-DD");
	return moment.tz(`${cd} 15:30:00`, indiaTimeZone).utc();
}

module.exports.getMarketOpenLocal = function() {
	var cd = moment().tz(indiaTimeZone).format("YYYY-MM-DD");
	return moment.tz(`${cd} 09:15:00`, indiaTimeZone).tz(localTimeZone);
}

module.exports.getMarketCloseLocal = function() {
	var cd = moment().tz(indiaTimeZone).format("YYYY-MM-DD");
	return moment.tz(`${cd} 15:30:00`, indiaTimeZone).tz(localTimeZone);
}

module.exports.convertIndianTimeInLocalTz = function(dt, format) {
	if (format) {
		return moment.tz(dt, format, indiaTimeZone).tz(localTimeZone);
	} else {
		return moment.tz(dt, indiaTimeZone).tz(localTimeZone);
	}
}

module.exports.convertLocaTimeToIndiaTz = function(dt, format) {
	if (format) {
		return moment(dt, format).tz(indiaTimeZone);
	} else {
		return moment(dt).tz(indiaTimeZone);
	}
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

module.exports.getMarketOpenHourLocal = function() {
	return exports.getMarketOpenLocal().get('hour');
}

module.exports.getMarketOpenMinuteLocal = function(){
	return exports.getMarketOpenLocal().get('minute');
}

module.exports.getMarketCloseHourLocal = function() {
	return exports.getMarketCloseLocal().get('hour');
}

module.exports.getMarketCloseMinuteLocal = function(){
	return exports.getMarketCloseLocal().get('minute');
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
	return moment.utc(d).set({hour: exports.getMarketCloseHour(), minute: exports.getMarketCloseMinute(), second: 0, millisecond: 0});
};

module.exports.getMarketOpenDateTime = function(date) {
	var d = moment.tz(date, indiaTimeZone).format("YYYY-MM-DD"); 
	return moment.utc(d).set({hour: exports.getMarketOpenHour(), minute: exports.getMarketOpenMinute(), second: 0, millisecond: 0});
};

module.exports.getMarketCloseDateTimeLocal = function(date) {
	var d = moment.tz(date, indiaTimeZone).format("YYYY-MM-DD"); 
	return moment.tz(d, localTimeZone).set({hour: exports.getMarketCloseHourLocal(), minute: exports.getMarketCloseMinuteLocal(), second: 0, millisecond: 0});
};

module.exports.getMarketOpenDateTimeLocal = function(date) {
	var d = moment.tz(date, indiaTimeZone).format("YYYY-MM-DD"); 
	return moment.tz(d, localTimeZone).set({hour: exports.getMarketOpenHourLocal(), minute: exports.getMarketOpenMinuteLocal(), second: 0, millisecond: 0});
};

module.exports.isMarketTrading = function(openMinuteOffset = 0, closeMinuteOffset = 0) {
	if (!exports.isHoliday()) {
		return _isAfterMarketOpen(openMinuteOffset) && _isBeforeMarketClose(closeMinuteOffset);
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

module.exports.getTradingDays = function(startDate, endDate) {
	var count = 0;
	
	while(exports.compareDates(startDate, endDate) < 0) {
		count++;
		startDate = exports.getNextNonHolidayWeekday(startDate);	
	}

	return count;
};

module.exports.getTradingDates = function(startDate, endDate, includeStart = true) {		
	var dates = [];
	
	var _sd = includeStart ? moment(startDate).subtract(1, 'days').toDate() : moment(startDate).toDate();

	while(exports.compareDates(_sd, endDate) < 0) {
		_sd = exports.getNextNonHolidayWeekday(_sd);	
		dates.push(_sd);
	}

	return dates;
};

module.exports.isEndOfMonth = function(date) {
	date = exports.getDate(date);
	
	var previousNonHolidayWeekday = exports.getPreviousNonHolidayWeekday(date, offset = 0)
	var nextNonHolidayWeekday = exports.getNextNonHolidayWeekday(date);

	return ((nextNonHolidayWeekday.getYear() > previousNonHolidayWeekday.getYear()) || (nextNonHolidayWeekday.getMonth() > previousNonHolidayWeekday.getMonth())) 
		&& exports.compareDates(date, previousNonHolidayWeekday) == 0;
};

module.exports.getEndOfMonth = function(date) {
	
	date = exports.getDate(date);
	date.setMonth(date.getMonth() + 1);
	date.setDate(1)

	return exports.getPreviousNonHolidayWeekday(date);
};

module.exports.getEndOfLastMonth = function(date) {
	date = exports.getDate(date);
	
	//Set date as 1st
	date.setDate(1);
	return exports.getPreviousNonHolidayWeekday(date);
}; 


module.exports.isEndOfWeek = function(date) {
	date = exports.getDate(date);
	
	var previousNonHolidayWeekday = exports.getPreviousNonHolidayWeekday(date, offset = 0)
	var nextNonHolidayWeekday = exports.getNextNonHolidayWeekday(date);

	return (nextNonHolidayWeekday.getDay() < previousNonHolidayWeekday.getDay()) 
		&& exports.compareDates(date, previousNonHolidayWeekday) == 0;
	
	//date - Thursday (4)
	//pDate - Thursday()
	//nDate - Friday (5)  - FALSE

	//date - Friday(5)  (non-holiday)
	//pDate - Friday(5)
	//nDate - Monday(0)  - TRUE

	//date - Friday(5)  (holiday)
	//pDate - Thursday(4) (non-holiday)
	//nDate - Monday(0) -- FALSE (dates don't match)

	//date - Monday(1)  (holiday)
	//pDate - Friday(4) (non-holiday)
	//nDate - Tuesday(2) --  FALSE
}; 

module.exports.getEndOfWeek = function(date) {
	date = exports.getDate(date);
	date = moment(date).endOf('week').toDate();

	while(exports.isHoliday(date)) {
		date = moment(date).subtract(1, 'day');
	}	
	
	return date;

};

module.exports.getEndOfLastWeek = function(date) {
	date = exports.getDate(date);
	date = moment(date).subtract(1, 'week').endOf('week').toDate();

	while(exports.isHoliday(date)) {
		date = moment(date).subtract(1, 'day');
	}	
	
	return date;
	
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
	"2018-12-25",
	"2019-01-26",
	"2019-03-04",
	"2019-03-21",
	"2019-04-13",
	"2019-04-14",
	"2019-04-17",
	"2019-04-19",
	"2019-05-01",
	"2019-06-05",
	"2019-08-12",
	"2019-08-15",
	"2019-09-02",
	"2019-09-10",
	"2019-10-02",
	"2019-10-08",
	"2019-10-27",
	"2019-10-28",
	"2019-11-12",
	"2019-12-25"
].map(item => exports.getDate(item));


//Test cases
// console.log(`UTC: ${exports.getMarketCloseDateTime()}`);
// console.log(`UTC: ${exports.getMarketOpenDateTime()}`);
// console.log(`UTC: ${exports.getMarketOpen()}`);
// console.log(`UTC: ${exports.getMarketClose()}`);
// console.log(_isBeforeMarketClose());
// console.log(_isAfterMarketOpen());

// console.log(`Local: ${exports.getMarketCloseDateTimeLocal()}`);
// console.log(`Local: ${exports.getMarketOpenDateTimeLocal()}`);
// console.log(`Local: ${exports.getMarketOpenLocal()}`);
// console.log(`Local: ${exports.getMarketCloseLocal()}`);



