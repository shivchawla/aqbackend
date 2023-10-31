/*
* @Author: Shiv Chawla
* @Date:   2018-11-02 13:05:39
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-27 12:37:15
*/

'use strict';
const config = require('config');
const schedule = require('node-schedule');
const Promise = require('bluebird');
var fs = require('fs');
var path = require("path");
const homeDir = require('os').homedir();

const APIError = require('../../utils/error');
const DateHelper = require('../../utils/Date');


//Reload data as soon as (2s delay) server starts
// setTimeout(function(){reloadData();}, 2000);

//Run when seconds = 10
// const marketOpenDateTimeHour = DateHelper.getMarketOpenDateTime().get('hour');
// const marketCloseDateTimeHour = DateHelper.getMarketCloseDateTime().get('hour');
// const scheduleDownloadRTData = `${config.get('nse_delayinseconds')+10} * ${marketOpenDateTimeHour-1}-${marketCloseDateTimeHour+1} * * 1-5`;

// schedule.scheduleJob(scheduleDownloadRTData, function() {
// 	processLatestFiles();
// });

// //Reload data before ranking calculation
// schedule.scheduleJob(`*/49 5-13 * * 1-5`, function() {
//     reloadData();
// });

/*
* HELPER: Request the Julia process to update the RT data
*/
function _updateData(filePath, type) {
	return Promise.resolve()
	.then(() => {

		if (filePath && filePath !="" && fs.existsSync(filePath)) {
			return SecurityHelper.updateRealtimePrices(filePath, type)
		} else {
			//console.log("Can't process realtime data. Bad filename");
			return false;
		}
	});
}

/*
* Get the last valid RT file available in the filesystem
*/
function _getLastValidFile(type) {
	var currentDate = new Date();
	var fileNumber = config.get('nse_maxfilecount');
	
	const monthNames = ["January", "February", "March", "April", "May", "June",
	  "July", "August", "September", "October", "November", "December"
	];

	var localUnzipFilePath = "";

	var found = false;
	var nAttempts = 0;
	var maxAttempts = config.get('nse_maxfilecount')*5;
	while(!found && nAttempts++ < maxAttempts) {
		
		var month = currentDate.getMonth();
		var date = currentDate.getDate();
		date = date < 10 ? `0${date}` : date;
		var year = currentDate.getFullYear();
		var nseDateStr = `${monthNames[month]}${date}${year}`;

		var localPath = path.resolve(path.join(homeDir, `/rtdata/${nseDateStr}`));
		
		var unzipFileName = `${fileNumber}.${type}`;
		localUnzipFilePath = `${localPath}/${unzipFileName}`;

		if (!fs.existsSync(localUnzipFilePath)) {
			fileNumber--;
			if (fileNumber == 0) {
				fileNumber = config.get('nse_maxfilecount');
				currentDate.setDate(currentDate.getDate() - 1);
			}
		} else {
			//activeDate = DateHelper.getDate(currentDate);
			found = true;
		}
	}

	return localUnzipFilePath;
}


/*
* Get latest RT file based on the current time
*/
function _getLatestFile(type) {

	return new Promise((resolve, reject) => {
		let fileNumber;
		var currentDate = new Date();
		var isHoliday = DateHelper.isHoliday(currentDate);

		let localUnzipFilePath = "";

		if (!isHoliday) {

			if (type == "mkt") {
				var dateNine15 = new Date();
				dateNine15.setUTCHours(3)
				dateNine15.setUTCMinutes(45);
				dateNine15.setUTCSeconds(0);
				var minutesPassed = Math.floor(Math.abs(currentDate - dateNine15)/1000/60);
				fileNumber = minutesPassed + 1;
				//Total number of files ~ 391 (393 - 3:32PM some times)
				//Using parameter config.get('nse_maxfilecount') to denote that
				
			} else if(type == "ind") {
				var dateEight50 = new Date();
				dateEight50.setUTCHours(3)
				dateEight50.setUTCMinutes(20);
				dateEight50.setUTCSeconds(0);
				minutesPassed = Math.floor(Math.abs(currentDate - dateEight50)/1000/60);
				fileNumber = minutesPassed + 1;
						}

			if (fileNumber > config.get('nse_maxfilecount')) {
				fileNumber = config.get('nse_maxfilecount');
			}

			const monthNames = ["January", "February", "March", "April", "May", "June",
			  "July", "August", "September", "October", "November", "December"
			];

			var month = currentDate.getMonth();
			var date = currentDate.getDate();
			date = date < 10 ? `0${date}` : date;
			var year = currentDate.getFullYear();
			var nseDateStr = `${monthNames[month]}${date}${year}`;
			
			var localPath = path.resolve(path.join(homeDir, `/rtdata/${nseDateStr}`));
			if (!fs.existsSync(localPath)) {
			    fs.mkdirSync(localPath);	
		  	}	

			var unzipFileName = `${fileNumber}.${type}`;
			localUnzipFilePath = `${localPath}/${unzipFileName}`;

			if (fs.existsSync(localUnzipFilePath)) {
				resolve(localUnzipFilePath);	
			} else {
				resolve(_getLastValidFile(type));
			}
			

	  	} else {
	  		reject(APIError.jsonError({message: "Weekend! No file can be downloaded"}));
	  	}
  	})
  	.catch(err => {
  		return _getLastValidFile(type);
  	})
}

function _sendAllUpdates() {
	return Promise.all([
		MktPlaceController.sendAllUpdates(),
	]);
}


/*
Reloads the realtime data to Julia in case of backend failure/restart
*/
function reloadData() {
	return new Promise.map(["ind", "mkt"], function(type) {
		var currentDate = new Date();
		var fileSet = config.get("nse_reload_file_set").split(",").map(item => parseInt(item.trim()));
		
		const monthNames = ["January", "February", "March", "April", "May", "June",
		  "July", "August", "September", "October", "November", "December"
		];

		var localUnzipFilePath = "";
		var localPath = "";

		var firstFileNumber = fileSet[0];
		var lastFileNumber = fileSet[1];

		var foundFileNumber = firstFileNumber;

		var found = false;
		var foundFileNumber	= 385; 
		var nAttempts = 0;
		var maxAttempts = config.get('nse_maxfilecount')*5;
		
		while(!found && nAttempts++ < maxAttempts) {
			
			var month = currentDate.getMonth();
			var date = currentDate.getDate();
			date = date < 10 ? `0${date}` : date;
			var year = currentDate.getFullYear();
			var nseDateStr = `${monthNames[month]}${date}${year}`;

			localPath = path.resolve(path.join(homeDir, `/rtdata/${nseDateStr}`));
			
			var unzipFileName = `${foundFileNumber}.${type}`;
			localUnzipFilePath = `${localPath}/${unzipFileName}`;

			if (!fs.existsSync(localUnzipFilePath)) {
				foundFileNumber--;
				if (foundFileNumber == 0) {
					foundFileNumber = firstFileNumber;
					currentDate.setDate(currentDate.getDate() - 1);
				}
			} else {
				//activeDate = DateHelper.getDate(currentDate);
				found = true;
			}
		}

		if (found) {
			//Here we have the folder where the fist reload file is found
			//Run a loop (from first(-5) to last file) to update the data
			var fileIndexIteratorArray = Array.from(Array(lastFileNumber + 1).keys()).slice(Math.max(foundFileNumber - 5, 1));
			return new Promise.mapSeries(fileIndexIteratorArray, function(fileNumber) {
				var filePath = `${localPath}/${fileNumber}.${type}`;
				return _updateData(filePath, type)
				.then(() => { 
					//Waiting for completion of the promise
					//Otherwise it tries to complete all requests in parallel
					return true;
				})
			});
		}
	});
}
