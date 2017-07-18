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

function exec(msg, res, cb) {

    var backtestId = msg.backtestId;
    let child = '';
    let splitter = '';
    let backtestData = '';

    console.log('Exec is called too');

    BacktestModel.fetchBacktest({
        _id: backtestId
    }, {})
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
            if (code === 1000) {
                try {
                    // If success and no data was generated => PENDING 
                    if(backtestData && Object.keys(backtestData).length > 0) {
                        cb(null, {output: backtestData, status:"complete"});
                    } else {
                        cb(null, {status:"exception"});
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


function updateBacktestResult(data, msg) {
    console.log("Updating Backtest");
    BacktestModel.updateBacktest({
        _id: msg.backtestId
    }, data);
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
            console.log(msg);
            handleAction(msg, res);
            
        });
    });
});

function handleAction(msg, res) {
    if(msg.action === 'subscribe-backtest') {
        handleExecSubscription(msg, res); 
    } else if(msg.action === 'exec-backtest') {

        let userQueue;
        let commonQueue;
           
        redisUtils.getValue('common-request-queue', function (err, data) {
        //redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
            if (err || !data) {          
                //var stringfiedMessage = JSON.stringify([{data:msg, in_process:true}]);
                commonQueue = [];
                redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));//stringfiedMessage );
                //handleExecBacktest(msg, res);
            } else {
                commonQueue = JSON.parse(data);
            }

            redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                if (err || !data) {
                    userQueue = [];
                    redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(userQueue));
                } else {
                    userQueue = JSON.parse(data);
                }
            
                let commonQueueMsg;
                let userQueueMsg = msg;
                if(commonQueue.length < config.get('max_num_julia_process_total')){
                    commonQueueMsg = {data:msg, in_process:true};
                    
                    //update both the queues
                    commonQueue.push(commonQueueMsg);
                    userQueue.push(userQueueMsg);

                    // Execute the backtest 
                    handleExecBacktest(msg, res);
             
                } else {
                    console.log("Queueing request");
                    commonQueueMsg = {data:msg, in_process:false};
                    commonQueue.push(commonQueueMsg);
                    userQueue.push(userQueueMsg);
                }


                redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));
                redisUtils.insertKeyValue(msg['aimsquant-token'] +'-request-queue', JSON.stringify(userQueue));

            });

        });
       
    }
}

//Function to subscribe WS data from backend to UI
function handleExecSubscription(msg, res) {
    var backtestId = msg.backtestId;
    //Call send data 
    //Send data automaticaly stops or reject the call ig backtest has completed
    subscribed[backtestId] = true;
    sendData(res, backtestId);
}

//Function to unsubscribe WS data from backend to UI
function handleExecUnsubscription(msg, res) {
    var backtestId = msg.backtestId;
    //Call send data 
    //Send data automaticaly stops or reject the call ig backtest has completed
    subscribed[backtestId] = false;
}

//Function to execute backtest.
//Pass comandline arguments to free Julia process
//Collect the output, send realtime updates and save the final output to the DB
function handleExecBacktest(msg, res) {
    if (msg.action === 'exec-backtest') {
        return exec(msg, res, (err, updateData) => {
            var status = updateData.status;

            if(err) {
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

            redisUtils.getValue('common-request-queue', function (err, data) {
                
                let commonQueue;
                let userQueue;
                if (data) {          
                    commonQueue = JSON.parse(data);
                }
                
                // now get user specific queue
                redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                    if (data) {
                        userQueue = JSON.parse(data);
                    }
                    
                    // find the backtestId in the commonQueue
                    var commonQueueIdx = commonQueue.map(x => x.data.backtestId).indexOf(msg.backtestId); 
                    let commonQueueMsg;

                    if(commonQueueIdx !=-1 ) {
                        commonQueueMsg = commonQueue[commonQueueIdx]
                    }

                    var userQueueIdx = userQueue.map(x=>x.backtestId).indexOf(msg.backtestId);
                    let userQueueMsg;

                    if(userQueueIdx != -1) {
                        userQueueMsg = userQueue[userQueueIdx]; 
                    }

                    if (commonQueueMsg && userQueueMsg) {
                        // If request was not completed, update in-process to FALSE
                        if(status == 'pending') {
                            commonQueue[commonQueueIdx].in_process = false;
                        } else {
                            // If request was completed (successfuly or with error)
                            // dequeue the request
                            commonQueue.splice(commonQueueIdx, 1);
                            userQueue.splice(userQueueIdx, 1)
                        }
                        
                        // Now find pending request in common queue
                        for(var i=0; i<commonQueue.length; i++){
                            if(commonQueue[i].in_process === false) {
                                handleAction(commonQueue[i].data, res);
                                commonQueue[i].in_process === true;
                                break;
                            }
                        }

                        // TODO: Add logic to transfer request from user to common queue.
                        // With this logic, a user can add mutliple request and not JAM the 
                        // coomon request queue if user request exceed the size

                    } else {
                        console.log("This is a problem. This should never happen");
                    }

                    redisUtils.insertKeyValue('common-request-queue', JSON.stringify(commonQueue));
                    redisUtils.insertKeyValue(msg['aimsquant-token']+'-request-queue', JSON.stringify(userQueue));
                
                });
        
            });
        });
    } else if (message === 'rl_close') {
        return res.send('Not implemented');
    }
}
 