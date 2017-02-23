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
var net = require('net');
const WebSocket = require('ws');   

var isopen = {};

// Initialzie map for status of each connection
// Our Julia server can only accept one connection per process
for(var machine of config.get('machines')) {
    var conn = 'ws://' + machine.host + ":" + machine.port;
    isopen[conn] = false
}

var outputData = {};
var subscribed = {};

function debounce(fn, delay) {
  var timer = null;
  return function () {
    var context = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(context, args);
    }, delay);
  };
}


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
        
        // TO DO: Progressively try to make connections with open julia process
        // create a string to bool dictioanry
        let wsClient;
        let conn;
        let backtestData = '';
        var backtestId = msg.backtestId;

        outputData[backtestId] = [];
        
        var isconnected = false;

        for (var connection in isopen){
            if (!isopen[connection]) {
                conn = connection;
                wsClient = new WebSocket(connection);
                isconnected = true;
                break;
            }
        }

        if (!isconnected) {
            return cb(null, {status:"pending"})
        }

        wsClient.on('open', function open() {
            console.log('Connection Open');
            console.log(conn);
            isopen[conn] = true;
            
            wsClient.send(argArray.join("??##"));

            subscribed[msg.backtestId] = true;

            redisUtils.insertKeyValue(msg.backtestId + '-data', JSON.stringify(outputData[backtestId]));
            
            setTimeout(function(){sendData(res, msg.backtestId);}, 
                    config.get('time_interval_realtime_output'));
        
        });

        wsClient.on('message', function(data) {
            // CHECK DATA: IF REQUEST WAS REJECTED, TRY WITH ANOTHER JULIA PROCESS 
            // Handled by checking the pendng status
            var backtestId = msg.backtestId;

            try {
                const dataJSON = JSON.parse(data);
                dataJSON.backtestId = backtestId;
                
                if (dataJSON.outputtype === 'backtest') {
                    backtestData = dataJSON;

                } else {
                    outputData[backtestId].push(dataJSON);
                }
                
            } catch (e) {
                console.log(e);
            }
        });

        wsClient.on('close', function close(code) {
            console.log('Connection Closed');
            console.log(conn);
            isopen[conn] = false;

            // Update the connection status
            if (code === 0) {
                try {
                    // If success and no data was generated => PENDING 
                    if(backtestData!='') {
                        cb(null, {output: backtestData, status:"complete"});
                    } else {
                        cb(null, {status:"pending"});
                    }
                } catch (e) {
                    cb(e, {status:"exception"});
                }
            }
        });

    })
    .catch(err => {
        cb(err, {status:"exception"});
    });
}

function sendData(res, backtestId) {
       
    var dataArray = outputData[backtestId];
    
    if (dataArray) {
        if(dataArray.length) {
            redisUtils.insertKeyValue(backtestId + '-data', JSON.stringify(dataArray));

            //Check if subscription is TRUE for the backtestId
            if (subscribed[backtestId]) {
                // Check if connection is OPEN
                if (res.readyState === WebSocket.OPEN) {
                    res.send(JSON.stringify({data:dataArray, backtestId: backtestId}));
                } else {
                    console.log("WebSocket is closed");
                }
            }
        }

        setTimeout(function(){sendData(res, backtestId);}, 
            config.get('time_interval_realtime_output'));
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

            // Call function based on action type
            // Action Types: 
            // 1. exec-backtest
            // 2. subscribe-backtest
            if(msg.action === 'subscribe-backtest') {
               execSubscription(msg, res); 
            } else if(msg.action === 'exec-backtest') {
                redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                    if (err || !data) {
                        redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify([{data:msg, in_process:true}]));
                        execBacktest(msg, res);

                    } else {
                        var queue = JSON.parse(data);

                        if(queue.length < config.get('max_num_julia_process')){
                            queue.push({data:msg, in_process:true});
                            execBacktest(msg, res);
                        } else {
                            queue.push({data:msg, in_process:false});
                        }
                          
                        redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(queue));
                    }

                });
            }
        });
    });
});

//Function to subscribe WS data from backend to UI
function execSubscription(msg, res) {
    var backtestId = msg.backtestId;
    //Call send data 
    //Send data automaticaly stops or reject the call ig backtest has completed
    subscribed[backtestId] = false;
    sendData(res, backtestId);
}

//Function to unsubscribe WS data from backend to UI
function execUnsubscription(msg, res) {
    var backtestId = msg.backtestId;
    //Call send data 
    //Send data automaticaly stops or reject the call ig backtest has completed
    subscribed[backtestId] = true;
}

//Function to execute backtest.
//Pass comandline arguments to free Julia process
//Collect the output, send realtime updates and save the final output to the DB
function execBacktest(msg, res) {
    if (msg.action === 'exec-backtest') {
        return exec(msg, res, (err, updateData) => {
            var status = updateData.status;

            if(err){
                res.send(JSON.stringify({backtestId:msg.backtestId, outputtype:"log", message:"Internal Exception", messagetype:"ERROR"}));
            } else {
                if(status == 'exception') {
                    res.send(JSON.stringify({backtestId:msg.backtestId, outputtype:"log", message:"Internal Exception", messagetype:"ERROR"}));   

                } else if(status != "pending") {
                    // Send the complete data one last time && delete the data from variable
                    sendData(res, msg.backtestId);
                }
            }

            updateBacktestResult(updateData, msg);

            // Set expiry for data in redis - 10s
            console.log("Setting Expiry");
            redisUtils.setDataExpiry(msg.backtestId + '-data', 10);
 
            //Remove backtestId key from outputData    
            delete outputData[msg.backtestId];

            redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                if (data) {
                    
                    var queue = JSON.parse(data);
                    
                    for(var i=0; i<queue.length; i++) {
                        
                        var queueMsg = queue[i].data; 
                        
                        if(queueMsg.backtestId === msg.backtestId && queueMsg.action === msg.action) {
                            
                            // If request was not completed, update in-process to FALSE
                            if(status == 'pending') {
                                queue[i].in_process = false;
                            } else {
                                // If request was completed (successfuly of with error)
                                // dequeue the request
                                queue.splice(i,1);
                            }

                            break;
                        }
                    }

                    for(var i=0; i<queue.length; i++){
                        if(queue[i].in_process === false){
                            execBacktest(queue[i].data, res);
                            queue[i].in_process === true;
                            break;
                        }
                    }

                    redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(queue));
                }

            });
        
        });
    } else if (message === 'rl_close') {
        return res.send('Not implemented');
    }
}
 