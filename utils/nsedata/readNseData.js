/*
* @Author: Shiv Chawla
* @Date:   2018-12-12 19:28:31
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-12-13 19:52:27
*/

var csv = require("fast-csv");
const homeDir = require('os').homedir();
var Parser = require("binary-parser").Parser;
var fs = require('fs');
var path = require("path");

/*
*** DATA FORMAT
	
	#HEADER
	#Transcode Short 2 Bytes
	#Timestamp Long 4 Bytes
	#Message Length Short 2 Bytes
	#Total 8 Bytes

	#DATA
	#Security Token Short 2 Bytes
	#Last Traded Price Long 4 Bytes
	#Best Buy Quantity Long 4 Bytes
	#Best Buy Price Long 4 Bytes
	#Best Sell Quantity Long 4 Bytes
	#Best Sell Price Long 4 Bytes
	#Total Traded Quantity Long 4 Bytes
	#Average Traded Price Long 4 Bytes
	#Open Price Long 4 Bytes
	#High Price Long 4 Bytes
	#Low Price Long 4 Bytes
	#Close Price Long 4 Bytes
	#Filler Long 4 Bytes (Blank)


***/

/*
* Function to read/parse *.mkt file from NSE (15 minutes delayed snapshot)
*/
module.exports.readMktFile = function(fname) {
	let output = {"RT": {}, "EOD": {}};

	return new Promise((resolve, reject) => {
		const readStream = fs.createReadStream(fname, {encoding: 'utf8'});
		const OBJECTSIZE = 156;
		
		let buffer = "";
		
		readStream.on('data', (data) => {
			try{
				var i=0;
				var nData = buffer.concat(data.replace(/ /g , "").replace(/(\r\n|\n|\r)/gm,""));

				buffer = nData.slice(i, i+OBJECTSIZE);
				
				while(buffer.length == OBJECTSIZE) {
					try{
				  		var p = new Parser()
			  			  	.endianess("little")
				  			.int16("tcode")
				  			.int32("timestamp")
				  			.int16("msgLength")
				  			.int16("stoken")
				  			.int32("last")
				  			.int32("bbq")
				  			.int32("bbp")
				  			.int32("bsq")
				  			.int32("bsp")
				  			.int32("ttq")
				  			.int32("atp")
				  			.int32("open")
				  			.int32("high")
				  			.int32("low")
				  			.int32("close")
				  			.int32("intHigh")
				  			.int32("intLow")
				  			.int32("intOpen")
				  			.int32("intClose")
				  			.int32("intTtq")
				  			.int32("blank")
				  			.parse(Buffer.from(buffer, 'hex'));

						i+=OBJECTSIZE;
						
			  			buffer = nData.slice(i, i+OBJECTSIZE);
			  			
						if (p.intClose != 0.0  && p.stoken in _codeToTicker) {
							output["RT"][_codeToTicker[p.stoken]] = {date: new Date(p.timestamp*1000), intOpen: p.intOpen/100, intHigh: p.intHigh/100, intLow: p.intLow/100, intClose: p.intClose/100};
						}
						
						if (p.close != 0.0 && p.stoken in _codeToTicker) {
							output["EOD"][_codeToTicker[p.stoken]] = {date: new Date(p.timestamp*1000), open: p.open/100, high: p.high/100, low: p.low/100, close: p.close/100};
						}
					} catch(err) {console.log(err); reject(err); break;}
					
				} //while ends*/
			} catch(err) {console.log(err); reject(err);}
			
		})
		.on('end', () => {
			resolve(output);
		})
		.on('error', (err) => {
			reject(err);
		})
	})
};


/// DATA FORMAT FOR INDEX DATA
/*	
	#HEADER
	#Transcode Short 2 Bytes
	#Timestamp Long 4 Bytes
	#Message Length Short 2 Bytes
	
	#DATA
	#Index Token Short 2 Bytes
	#Current Index Value Long 4 Bytes
	#High Index Value Long 4 Bytes
	#Low Index Value Long 4 Bytes
	#Percentage Change in Index Long 4 Bytes
	#Filler Long 4 Bytes (Blank)
*/

/*
* Function to read/parse *.mkt file from NSE (15 minutes delayed snapshot)
*/
module.exports.readIndFile = function(fname) {
	let output = {"RT": {}, "EOD": {}};

	return new Promise((resolve, reject) => {
		const readStream = fs.createReadStream(fname, {encoding: 'utf8'});
		const OBJECTSIZE = 100;
		
		let buffer = "";
		
		readStream.on('data', (data) => {
			try{
				var i=0;
				var nData = buffer.concat(data.replace(/ /g , "").replace(/(\r\n|\n|\r)/gm,""));
				buffer = nData.slice(i, i+OBJECTSIZE);
				
				while(buffer.length == OBJECTSIZE) {
					try{
				  		var p = new Parser()
			  			  	.endianess("little")
				  			.int16("tcode")
				  			.int32("timestamp")
				  			.int16("msgLength")
				  			.int16("itoken")
				  			.int32("open")
				  			.int32("current")
				  			.int32("high")
				  			.int32("low")
				  			.int32("change")
				  			.int32("intHigh")
				  			.int32("intLow")
				  			.int32("intOpen")
				  			.int32("intClose")
				  			.int32("blank")
				  			.parse(Buffer.from(buffer, 'hex'));

						i+=OBJECTSIZE;
						
			  			buffer = nData.slice(i, i+OBJECTSIZE);
			  			
						//Computing close as this file is different from mkt file
						//Doesn't contain last close
						var close  = Math.round((p.current/100)/(1+p.change/10000), 2)

						if (p.intClose != 0.0 && p.itoken in _codeToIndex) {
							output["RT"][_codeToIndex[p.itoken]] = {date: new Date(p.timestamp*1000), intOpen: p.intOpen/100, intHigh: p.intHigh/100, intLow: p.intLow/100, intClose: p.intClose/100};
						}
						
						if (p.close != 0.0 && p.itoken in _codeToIndex) {
							output["EOD"][_codeToIndex[p.itoken]] = {date: new Date(p.timestamp*1000), open: p.open/100, high: p.high/100, low: p.low/100, close};
						}
					} catch(err) {console.log(err); reject(err); break}
					
				}//while ends*/

			} catch(err) {console.log(err); reject(err);}
			
		})
		.on('end', () => {
			resolve(output);
		})
		.on('error', (err) => {

			reject(err);
		})
	})
	
};

///
/*** DATA FORMAT FOR SECURITY DATA	
	
	#HEADER
	#Transcode Short 2 Bytes
	#Timestamp Long 4 Bytes
	#Message Length Short 2 Bytes
	
	#DATA
	#Token Number Short 2 Bytes
	#Symbol Char 10 Bytes
	#Series Char 2 Bytes
	#Issued Capital Double 8 Bytes
	#Warning Percent Short 2 Bytes
	#Freeze Percent Short 2 Bytes
	#Credit Rating Char 12 Bytes
	#Issue Rate Short 2 Bytes
	#Issue Start Date Long 4 Bytes
	#Issue Pdate Long 4 Bytes
	#Issue Maturity Date Long 4 Bytes
	#Board Lot Quantity Long 4 Bytes
	#Tick Size Long 4 Bytes
	#Name of Company Char 25 Bytes
	#Record Date Long 4 Bytes
	#Expiry Date Long 4 Bytes
	#No Delivery Start Date Long 4 Bytes
	#No Delivery End Date Long 4 Bytes
	#Book Closure Start Date Long 4 Bytes
	#Book Closure End Date Long 4 Bytes
*/

/*
* Function to read security data
*/
function _readSecurityFile(fname) {
	let output = {};

	return new Promise((resolve, reject) => {
		const readStream = fs.createReadStream(fname, {encoding: 'utf8'});
		const OBJECTSIZE = 234;
		
		let buffer = "";

		readStream.on('data', (data) => {
			try{
				var i=0;
				var nData = buffer.concat(data.replace(/ /g , "").replace(/(\r\n|\n|\r)/gm,""));
				buffer = nData.slice(i, i+OBJECTSIZE);
				
				while(buffer.length == OBJECTSIZE) {
					try{
				  		var p = new Parser()
			  			  	.endianess("little")
				  			.int16("tcode")
				  			.int32("timestamp")
				  			.int16("msgLength")
				  			.int16("stoken")
				  			.string("symbol", {length: 10})
				  			.string("series", {length: 2})
				  			.double("issuedCapital")
				  			.int16("warningPct")
				  			.int16("freezePct")
				  			.string("creditRating",{length: 12})
				  			.int16("issueRateShort")
				  			.int32("issueStartDate")
				  			.int32("issuePDate")
				  			.int32("issueMaturityDate")
				  			.int32("lotQuantity")
				  			.int32("tickSize")
				  			.string("nameCompany",{length: 25})
				  			.int32("recordDate")
				  			.int32("expiryDate")
				  			.int32("noDeliveryStartDate")
				  			.int32("noDeliveryEndDate")
				  			.int32("bookClosureStartDate")
				  			.int32("bookClosureEndDate")
				  			.parse(Buffer.from(buffer, 'hex'));

						i+=OBJECTSIZE;
						
			  			buffer = nData.slice(i, i+OBJECTSIZE);
			  			
						if (p.series == "EQ") {
							output[p.stoken] = p.symbol.trim().replace("[^a-zA-Z0-9]", "_");
						}
					} catch(err){console.log(err); reject(err); break}
					
				}//while ends*/
			} catch(err) {console.log(err); reject(err);}
			
		})
		.on('end', () => {
			resolve(output);
		})
		.on('error', (err) => {
			reject(err);
		})
	})
};

module.exports.readSecurities = function() {
	return new Promise(resolve => {
		var securitiesFilePath = path.resolve(path.join(__dirname, '/Securities.dat'));
		resolve(_readSecurityFile(securitiesFilePath))
	})
};


module.exports.readIndices = function() {
    return new Promise((resolve, reject) => {
	    let output = {};
		var indexFilePath = path.resolve(path.join(__dirname, '/benchmark.csv'));
	    
	    csv.fromPath(indexFilePath)
	 	.on("data", function(data){
	    	output[data[1]] = data[0];
	 	})
	 	.on("end", function(){
	 		resolve(output);
	 	})
	 	.on("error", function(err){
	 		reject(err);
	 	})
 	})
};  

module.exports.processNseData = function(fileName, fileType) {
	if (fileType == "ind") {
		return exports.readIndFile(fileName);
	} else if(fileType == "mkt") {
		return exports.readIndFile(fileName);
	}
};

_codeToTicker = {}; 
_codeToIndex = {}; 
dictionaryExists = false;

module.exports.refreshNseTokenLookup = function() {
	return Promise.resolve()
	.then(() => {
		if (dictionaryExists) {
			return Promise.all([exports.readSecurities(), exports.readIndices()])
			.then(([securitiesDict, indicesDict]) => {
				_codeToTicker = securitiesDict;
				_codeToIndex = indicesDict;
				dictionaryExists = true;
				return dictionaryExists;
			});
		} else { return true;}
	});
};
