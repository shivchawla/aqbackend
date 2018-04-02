/*
* @Author: Shiv Chawla
* @Date:   2017-11-08 13:39:25
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2017-11-29 20:53:26
*/
const CryptoJS = require('crypto-js');
const config = require('config');

function parseSettings(bt, forward) {
 	var args = [];

    args = args.concat(['--code', CryptoJS.AES.decrypt(bt.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

	var settings = bt.settings;
	args = args.concat(['--capital', settings.initialCash]);
	
	let startDate = settings.startDate;
	if (forward) {
	 	var cd = bt.createdAt; 
       	startDate = cd.getFullYear()+"-"+(cd.getMonth()+1)+"-"+cd.getDate();    
	}

	args = args.concat(['--startdate', startDate]);
	
	if(!forward) {
		args = args.concat(['--enddate', settings.endDate]);
	}

    if (settings.universe && settings.universe!='') {
	   args = args.concat(['--universe', settings.universe]); 
    }

	if (settings.universeIndex) {
        args = args.concat(['--index', settings.universeIndex]); 
    }

	if (settings.benchmark) {
        args = args.concat(['--benchmark', settings.benchmark]); 
    }

    var advanced = JSON.parse(settings.advanced);
    if(advanced.exclude) {
        args = args.concat(['--exclude', advanced.exclude]);
    }

    if(advanced.investmentPlan) {
        args = args.concat(['--investmentplan', advanced.investmentPlan]);
    }

    if(advanced.rebalance) {
        args = args.concat(['--rebalance', advanced.rebalance]);
    }

    if(advanced.cancelPolicy) {
        args = args.concat(['--cancelpolicy', advanced.cancelPolicy]);
    }

    if(advanced.executionPolicy) {
        args = args.concat(['--executionpolicy', advanced.executionPolicy]);
    }

    if(advanced.resolution) {
        args = args.concat(['--resolution', advanced.resolution]);
    }

    if(advanced.commission) {
        var commission = advanced.commission.model + ',' + advanced.commission.value.toString();
        args = args.concat(['--commission', commission]);
    }

    if(advanced.slippage) {
        var slippage = advanced.slippage.model + ',' + advanced.slippage.value.toString();
        args = args.concat(['--slippage', slippage]);
    }

    return args;
}

module.exports = {parseSettings};
