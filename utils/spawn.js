'use strict';
const spawn = require('child_process').spawn;
const StreamSplitter = require('stream-splitter');
const ws = require('../index').ws;
const jwtUtil = require('../utils/jwttoken');
const redisUtils = require('../utils/RedisUtils');
const BacktestModel = require('../models/backtest');
const StrategyModel = require('../models/strategy');
var CryptoJS = require("crypto-js");
const config = require('config');

var outputData = {};
function exec(msg, res, cb) {

    var backtestId = msg.backtestId;
    let child = '';
    let splitter = '';
    let backtestData = '';

    console.log('Exec is called too');

    BacktestModel.fetchBacktest({
        _id: backtestId
    })
    .then(bt => {
        var args = [];

        if(!bt){
            throw "InValid Backtest";
        }

        if(bt) {
            
            args = args.concat(['--code', CryptoJS.AES.decrypt(bt.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

            var settings = bt.settings;
            args = args.concat(['--capital', settings.initialCash]);
            args = args.concat(['--startdate', settings.startDate]);
            args = args.concat(['--enddate', settings.endDate]);
            args = args.concat(['--universe', settings.universe]);

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

        }

        return args;
    })
    .then(argArray => {

        child = spawn('/Applications/Julia-0.5.app/Contents/Resources/julia/bin/julia', ["../../raftaar/Util/justrun.jl"].concat(argArray), {
            cwd: './utils'
        });

        splitter = child.stdout.pipe(StreamSplitter('\n'));
        
        outputData[msg.backtestId] = []; 

        setTimeout(function(){sendData(res, msg.backtestId);}, 
                    config.get('time_interval_realtime_output'));
        
        splitter.on('token', function(token) {
            let data;
            try {

                data = token.toString();

                const dataJSON = JSON.parse(data);
                dataJSON.backtestId = msg.backtestId;
                
                if (dataJSON.outputtype === 'backtest') {
                    backtestData = dataJSON;
                } else {
                    outputData[msg.backtestId].push(dataJSON);
                }
            } catch (e) {
                console.log(e);
            }
        });

        child.stderr.setEncoding('utf8');

        child.stderr.on('data', function(data) {  
            console.log(data.trim());
            //cb(data.trim());
        });

        child.on('close', function(code) {
            if (code === 0) {
                try {
                    cb(null, backtestData);
                } catch (e) {
                    cb(e);
                }
            }
        });
    })
    .catch(err => {
        cb(err);
    });
}

function sendData(res, backtestId, oData) {
    
    if(!oData){
        oData = outputData[backtestId];
    }
    
    if (oData) {    
        redisUtils.getValue(backtestId + '-data', function (err, data) {

            console.log("lshdhshdshkshdkshdkshd");
            redisUtils.insertKeyValue(backtestId + '-data', JSON.stringify(oData));

            //expiry in 10 min
            redisUtils.setDataExpiry(backtestId + '-data', 600);
            res.send(JSON.stringify({backtestId:backtestId, data:oData}));

            setTimeout(function(){sendData(res, backtestId);}, 
                        config.get('time_interval_realtime_output'));

        });
    }
}


function updateBacktestResult(updateData, msg) {
    console.log("Updating Backtest");
    BacktestModel.updateBacktestUpdated({
        _id: msg.backtestId
    }, updateData);
}

ws.on('connection', function connection(res) {
    res.on('message', function(message) {
        let msg;
        
        try {
            msg = JSON.parse(message);
        } catch (e) {
            return res.send('not valid json');
        }

        if (!msg || !msg['aimsquant-token']) {
            return res.send({
                'aimsquant-token': '',
                action: 'exec-backtest',
                backtestId: 'afd'
            });
        }

        jwtUtil.verifyToken(msg['aimsquant-token'])
        .then(decoded => {
            if (decoded.exp <= Date.now()) {
                res.send('token expired');
                return;
            }

            redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                if (err || !data) {
                    redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify([{data:msg, in_process:true}]));
                    execProcess(msg, res);
                } else {
                    var queue = JSON.parse(data);

                    if(queue.length < config.get('max_num_julia_process')){
                        queue.push({data:msg, in_process:true});
                        execProcess(msg, res);
                    } else {
                        queue.push({data:msg, in_process:false});
                    }
                      
                    redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(queue));
                }

            });
        });
    });
});

function execProcess(msg, res) {
    if (msg.action === 'exec-backtest') {
        return exec(msg, res, (err, data) => {
            var updateData;

            if(err){
                res.send(JSON.stringify({backtestId:msg.backtestId, outputtype:"log", message:"Internal Exception", messagetype:"ERROR"}));
                updateData = {status : 'exception'};

            } else {
                if(data=='') {
                    res.send(JSON.stringify({backtestId:msg.backtestId, outputtype:"log", message:"Internal Exception", messagetype:"ERROR"}));   
                    updateData = {status : 'exception'};
                } else {
                    updateData = {output: data, status: 'complete'};
                }

            }

            // Send the complete data one last time
            sendData(res, msg.backtestId, outputData[msg.backtestId]); 
            // Remove data from global variable
            delete outputData[msg.backtestId];

            redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                if (data) {
                    var queue = JSON.parse(data);
                    for(var i=0; i<queue.length; i++) {
                        var queueMsg = queue[i].data; 
                        if(queueMsg.backtestId === msg.backtestId && queueMsg.action === msg.action) {
                            queue.splice(i,1);
                            break;
                        }
                    }

                    for(var i=0; i<queue.length; i++){
                        if(queue[i].in_process === false){
                            execProcess(queue[i].data, res);
                            queue[i].in_process === true;
                            break;
                        }
                    }

                    redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(queue));
                }
                
               updateBacktestResult(updateData, msg);

            });
        
        });
    } else if (message === 'rl_close') {
        return res.send('Not implemented');
    }
}
 