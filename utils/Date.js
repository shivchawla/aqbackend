/*
* @Author: Shiv Chawla
* @Date:   2018-03-31 19:38:33
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-03-31 22:51:32
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