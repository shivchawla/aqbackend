/*
* @Author: Shiv Chawla
* @Date:   2018-12-12 19:29:20
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-13 19:50:53
*/

'use strict';
const config = require('config');
const schedule = require('node-schedule');
const Promise = require('bluebird');
let Client = require('ssh2-sftp-client');
let sftp = new Client();
var fs = require('fs');
var path = require("path");
const zlib = require('zlib');
const _ = require('lodash');
const homeDir = require('os').homedir();

const APIError = require('../error');
const DateHelper = require('../Date');
const NseDataHelper = require('./readNseData');
const RedisUtils = require('./redisUtils');

var sftpClosed = true;
var allDownloaded = false;
const fileTypes = ["ind", "mkt"];

sftp.on('close', function(err) {
	console.log("SFTP - On Close event");
	console.log(err);
	sftpClosed = true;
});

sftp.on('error', function(err) {
	console.log("SFTP - On Error event");
	console.log(err);
	sftpClosed = true;
});

sftp.on('ready', function() {
	console.log("SFTP - On Ready event");
	sftpClosed = false;
});

function connectSFTP() {
	if (sftpClosed) {
		console.log("Attempting Reconnect - SFTP");
		return sftp.connect({
		    host: config.get('nse_host'),
		    port: config.get('nse_port'),
		    username: config.get('nse_user'),
		    privateKey: fs.readFileSync(path.resolve(path.join(__dirname,`./token/${config.get('nse_private_key')}`))),
		    //privateKey: fs.readFileSync(path.resolve(path.join(__dirname,`../../controllers/Realtime/nse_15min_token_develop`))),
		    //debug:debugConnection,
		    keepaliveInterval: 5000
		})
	} else {
	        console.log("SFTP already connected");
		return new Promise(resolve => {
			resolve(true);
		});
	}	
}


function _writeFile(data, file) {
	return new Promise((resolve, reject) => {
    	try {
    		var writeUnzipStream = fs.createWriteStream(file);
    		data.pipe(zlib.createUnzip()).pipe(writeUnzipStream);
    		
    		//'finish' event is sometimes not called
    		//Thus resolve after 10 seconds (this is bad code)
    		//setTimeout(function(){resolve(true);}, 10000);
    		writeUnzipStream.on('finish', () => {
			  	console.log('All writes are now complete.');
			  	resolve(true);
			});

			writeUnzipStream.on('error', (err) => {
			  	console.log('Error while unzipping file');
			  	resolve(true);
			});

			writeUnzipStream.on('close', () => {
			  	resolve(true);
			});
		} catch(err) {
			reject(err);
		}
	});
}

function downloadNSEData(fileN) {
	return Promise.map(fileTypes, function(type) {
		
		let localUnzipFilePath;
		let nseFilePath;

		console.log("Starting download process now");
		
		return new Promise((resolve, reject) => {
			let fileNumber;
			var currentDate = new Date();
			var isWeekend = currentDate.getDay() == 0 || currentDate.getDay() == 6;

			if (!isWeekend) {

				if (type == "mkt") {
					var dateNine15 = new Date();
					dateNine15.setUTCHours(3)
					dateNine15.setUTCMinutes(45);
					dateNine15.setUTCSeconds(0);
					var minutesPassed = Math.floor(Math.abs(currentDate - dateNine15)/1000/60);
					fileNumber = fileN || minutesPassed + 1;
					//Total number of files ~ 391 (393 - 3:32PM some times)
					//Using parameter config.get('nse_maxfilecount') to denote that
					
				} else if(type == "ind") {
					var dateEight50 = new Date();
					dateEight50.setUTCHours(3)
					dateEight50.setUTCMinutes(20);
					dateEight50.setUTCSeconds(0);
					minutesPassed = Math.floor(Math.abs(currentDate - dateEight50)/1000/60);
					fileNumber = fileN || minutesPassed + 1;
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
				var zipFileName = `${fileNumber}.${type}.gz`;
				
				var nseFilePath =`/CM30/DATA/${nseDateStr}/${zipFileName}`;

				var localPath = path.resolve(path.join(homeDir, `/rtdata/${nseDateStr}`));
				
				if (!fs.existsSync(localPath)) {
				    fs.mkdirSync(localPath);	
			  	}	

				var unzipFileName = `${fileNumber}.${type}`;
				localUnzipFilePath = `${localPath}/${unzipFileName}`;

				resolve(nseFilePath);

		  	} else {
		  		reject(APIError.jsonError({message: "Weekend! No file can be downloaded"}));
		  	}
	  	})
	  	.then(nseFile => {
		   //Wrap sftp operation inside a promise
	  		//to detect sftp related errors
	  		if (!fs.existsSync(localUnzipFilePath)) {
			   	return new Promise((resolve, reject) => {
			   		sftp.get(nseFile, false, null)
			   		.then(data => {
			   			resolve(data);
			   		}).catch(err => {
			   			sftpClosed = true;
			   			reject(err);
			   		})
		   		});
	   		} else {
	   			APIError.throwJsonError({message: "File already exists"});
	   		}

	   	})
		.then(data => {
			return !fs.existsSync(localUnzipFilePath) ? _writeFile(data, localUnzipFilePath) : true
		}) 
		.then(fileSaved => {
			if (!fs.existsSync(localUnzipFilePath)) {
				return localUnzipFilePath;
			} else {
				APIError.throwJsonError({message: "No RT file downloaded/saved"});
			}
		})
		.catch(err => {
			console.log(err);
			console.log("Error while downloading/updating NSE file");
		});
	});
}

function uploadLatestDataToRedis(fileName, fileType) {
	return NseDataHelper.processNseData(fileName, fileType)
	.then(nseData => {

		var rtData = _.get(nseData, "RT", {});
		var nextMarketOpen = DateHelper.getMarketOpenDateTime(DateHelper.getNextNonHolidayWeekday());
		var currentDate = DateHelper.getMarketCloseDateTime();

		Promise.map(Object.keys(rtData), (key) => {
			var redisSetKey = `RtData_${currentDate.utc().format("YYYY-MM-DDTHH:mm:ss[Z]")}_${key}`; 
			return RedisUtils.pushValueInRedisList(redisSetKey, JSON.stringify(rtData[key]), function(err, reply) {
				if (err) {
					console.log(err);
				}

				if(reply) {
					RedisUtils.expireKeyInRedis(redisSetKey, Math.floor(nextMarketOpen.valueOf()/1000))
				}
			})
		})
	})
}

//connectSFTP();

function downloadAllFiles() {
	if (!sftpClosed) {
		var  minutes = [...Array(400).keys()].map(x => x++); 
		Promise.mapSeries(minutes, function(minute) {
	    	return downloadAndUpdateNseData(minute);
		});
	}
}

function downloadAndUpdateNseData(minute) {
	return NseDataHelper.refreshNseTokenLookup()
	.then(() => {
 		return downloadNSEData(minute);
	})
    .then(localFiles => {
    	return Promise.mapSeries(localFiles, (fileName, index) => {
    		return uploadLatestDataToRedis(fileName, fileTypes[index]);
		})
    })
}


//Run when seconds = 10
/*schedule.scheduleJob(`40 * 4-13 * * 1-5`, function() {
    
    return downloadAndUpdateNseData()
    .catch(err => {
    	console.log(err.message);
    	if (sftpClosed){
    		console.log("Reconnecting SFTP");
    		connectSFTP();
    	}
    })
});*/


