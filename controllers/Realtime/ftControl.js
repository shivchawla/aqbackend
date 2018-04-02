'use strict';
var redis = require("redis");
const redisUtils = require('../../utils/RedisUtils');
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const schedule = require('node-schedule');
const ForwardTestModel = require('../../models/Research/forwardtest');
const SettingsParser = require('./btSettings.js');
const serverPort = require('../../index').serverPort;

var numAttempts = {};
var numRequests = 0;
function getConnectionForFt() {
    var machines = config.get('ftmachines');
    var machine = machines[numRequests++ % machines.length];
    return 'ws://' + machine.host + ":" + machine.port;
}

/* =====================================
        FORWARD TEST CONTROL
===================================== */

// Manual trigger of a particular forward test
function runForwardTest(forwardtestId) {
    execForwardTest(forwardtestId, server, function(err, updateData) {
        if(err||updateData.status === "exception") {
            console.log("Forward test with id: " + forwardtestId + " could not processed");
            console.error("Error Occured:");
            console.error(err);
            // We can again push this task in the forwardQueue and wait for it's turn to be processed again but I say nay-nay, not a good idea
            // forwardQueue.push(forwardtestId);
        } else {
            // Update data for successful forward test run
            updateForwardTestResult(forwardtestId, updateData);

            //clearSaveDataTimer(backtestId, true);
            redisUtils.setDataExpiry(`backtest-realtime-${forwardtestId}`, 5);
            redisUtils.setDataExpiry(`backtest-final-${forwardtestId}`, 5);
        }

        delete numAttempts[forwardtestId];
    });
}

// Schedule all the forward test jobs
var schedulerString = config.get('ft_second') + " " + config.get('ft_minute') + " "+config.get('ft_hour')+ ' * * *';

if (serverPort == config.get('ft_port')) {
    schedule.scheduleJob(schedulerString, function() {
        runAllForwardTest();
    });
}

function runAllForwardTest() {
    console.log("Trying running all forwardtests");
    // Load all the forward tests from redis into forwardQueue
    
    ForwardTestModel.fetchForwardTests({active:true, error:false, deleted:false}, {})
    .then(ft => {

        ft.forEach(item => {
            redisUtils.insertIntoRedis(`forwardtest-request-queue-${serverPort}`, item._id, 1);
        });
        
        redisUtils.getAllFromRedis(`forwardtest-request-queue-${serverPort}`, function(err, data) {
            if(err) {
                return console.error("Error: " + err);
            }
            if (!data) {
                // Redis is empty
                return console.log("All forwardtests over!");
            }

            // Forwardtest requests queue
            let forwardQueue = Object.keys(data);

            // ft will be an array consisting of all active forward tests
            forwardQueue.forEach(forwardtestId => {
                numAttempts[forwardtestId] = 0;
                handleExecForwardTest(forwardtestId);
            });
        });
    })
    .catch(err => {
        console.error(err);
    });
}

// Forward test handler for running each forward test "synchronously"
function handleExecForwardTest(forwardtestId) {
    
    numAttempts[forwardtestId] == forwardtestId in numAttempts ? numAttempts[forwardtestId] + 1 : 1;

    // There are pending forward tests
    execForwardTest(forwardtestId, function(err, updateData) {
        if(err || updateData.status === "exception") {
            console.log("Forward test with id: " + forwardtestId + " could not processed");
            console.error("Error Occured:");
            console.error(err);
        } else {
            // Update data for successful forward test run
            updateForwardTestResult(forwardtestId, updateData);

            //Delete the forward test from the queue
            redisUtils.deleteFromRedis(`forwardtest-request-queue-${serverPort}`, forwardtestId, function(err, reply) {
                if (err) {
                    return console.error(err);
                } 
            });
        }
    });
}

// Forward test executer
// Will start running a forward test on the Julia server
function execForwardTest(forwardtestId, cb) {
    console.log('execForwardTest is called');
    
    var connection = getConnectionForFt();
    console.log(`Choosing connection: ${connection}`)

    ForwardTestModel.fetchForwardTest({
        _id: forwardtestId, active: true, error: false, deleted: false}, {})
    .then(ft => {
        if(!ft) {
            throw new Error("Invalid Forward Test");
        }

        let args = [];
        // If there is serialized data available then pass it as command line arg
        // Otherwise it's a fresh start
        var restart = false || ft.restart || !ft.serializedData;

        if(!restart) {
            try {

                args = args.concat(['--backtestid', forwardtestId]);
                args = args.concat(['--code', CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);
                args = args.concat(['--serializedData', JSON.stringify(ft.serializedData)]);

                //Pick the last date + 1 from serialized data
                var accounttracker = ft.serializedData.accounttracker;

                if(accounttracker) {
                    var dates = Object.keys(accounttracker).sort();
                    if(dates.length == 0) {
                        throw new Error("No dates in accounttracker");
                    }

                    var lastdate = new Date(dates[dates.length - 1]);
                    var cd = new Date(lastdate.setDate(lastdate.getDate() + 1));
                    var startDate = cd.getFullYear()+"-"+(cd.getMonth()+1)+"-"+cd.getDate();    

                    args = args.concat(['--startdate', startDate]);

                } else {
                    throw new Error("No Account tracker in serialized data");
                }
            } catch (err) {
                //reset variables 
                args = [];
                restart = true;
                console.error(err.message);
            }
        }

        //Only when restart = true 
        if(restart) {
            // No deserialized data was found
            // to obtain the initial settings
            args = SettingsParser.parseSettings(ft, true);
            args = args.concat(['--backtestid', forwardtestId]);
        }
 
        // And most importantly
        args = args.concat(['--forward', 'true']);

        return args;
    })
    .then(argArray => {

        let algorithm = '';
        let forwardData = '';
        let ftClient = '';

        try {
            ftClient = new WebSocket(connection);
        } catch (err) {
            console.log(`Server: ${connection} not available`);
            handleRequestDenial(forwardtestId);
            return;
        }
        
        var subscriber = redis.createClient(config.get('redis_port'), config.get('redis_host'))
        
        var juliaError = false;
        var internalError = false;
        var juliaErrorMessage = '';

        ftClient.on('open', function() {
            console.log('Connection Open');

            //Delete any data for this backtestId in redis
            //Mosty, it won't be there bu just in case
            try {
                console.log(`Deleting existing data for ${forwardtestId}`);
                redisUtils.deleteKey(`backtest-realtime-${forwardtestId}`);
                redisUtils.deleteKey(`backtest-final-${forwardtestId}`);
            } catch(err) {
                console.log(err);
                throw new Error("Error Deleting from redis");
            }

            try {
                ftClient.send(JSON.stringify({args:argArray.join("??##"), requestType:"execute"}));
            } catch(err) {
                console.log(err);
                console.log(`Error: Sending message to WS connection: ${conn}`);
                handleRequestDenial(forwardtestId, connection);
                return;
            }

        });

        ftClient.on('message', function(data) {
            //Now only called when connection is refused
            //Now, real-time data comes through Redis PUB/SUB
            try {
                const dataJSON = JSON.parse(data);

                if(dataJSON.outputtype === "internal") {
                    if(dataJSON.code == 503) {
                        handleRequestDenial(forwardtestId, connection);
                        return;
                    } else if(dataJSON.code == 200) {
                        //Request Accepted
                        subscriber.subscribe(`backtest-final-${forwardtestId}`);
                        subscriber.subscribe(`backtest-realtime-${forwardtestId}`);
                    }
                }
            } catch (e) {
                console.log(e);
                throw new Error("Error parsing Julia server output");
            }
        });

        subscriber.on("message", function(channel, message) {
            if(channel.indexOf("backtest-final") != -1) {
                var incomingForwardtestId = channel.split("-")[2];
                 
                if(message == "backtest-final-output-ready") {
                    setTimeout(function(){saveData(forwardtestId, cb, juliaError);}, 1000);
                } 
            }

            if(channel.indexOf("backtest-realtime") != -1) {
                try {
                    const dataJSON = JSON.parse(message);
               
                    if(dataJSON.outputtype === 'log' && dataJSON.messagetype === "ERROR") {
                        juliaError = true;
                    } else if(dataJSON.outputtype === "internal") {
                        juliaError = true;
                    }
                }
                catch (e) {
                    console.log(e);
                    throw new Error(`Error Parsing realtime data for ${forwardtestId}`);
                }
            }
        });
    })
    .catch(err => {
        //console.log(err);
        cb(err, {updateMessage:"Test could not be completed"});
    });
}

function handleRequestDenial(forwardtestId, connection) {
    if(numAttempts[forwardtestId] % config.get('ftmachines').length != 0) {
        console.log(`Server: ${connection} is unavailable. Moving to next connection`);
        handleExecForwardTest(forwardtestId);
    } else {
        console.log("All Servers Unavailable!! Will retry in 1 minute");
        setTimeout(function(){handleExecForwardTest(forwardtestId)}, 60000);
    }
}

function saveData(forwardtestId, cb, juliaError) {
    redisUtils.getRangeFromRedis(`backtest-final-${forwardtestId}`, 0 , -1, function(err, data) {
        if(data){
            
            let forwardData, algorithm='';
            try {

                var forwardDataArray = new Array(data.length);
                var i = 0;
                
                data.forEach(item => {
                    forwardDataArray[i++] = JSON.parse(item);
                });

                forwardDataArray.sort(function compare(a, b) {
                    if (a.index < b.index) {
                        return -1;
                    } else if (a.index > b.index) {
                        return 1;
                    }
                    return 0;
                });

                forwardData = JSON.parse(forwardDataArray.map(item => item.data).join(""));
           
                if (forwardData.outputtype === 'serializedData') {
                    algorithm = forwardData.algorithm;
                }

                if(algorithm && Object.keys(algorithm).length > 0) {
                    cb(null, {serializedData: algorithm, updatedAt: new Date(), updateMessage:"Successfully updated"});
                } else if (internalError) {
                    cb(null, {updatedAt: new Date(), updateMessage: "Test couldn't complete for internal reasons"});
                } else if (juliaError) {
                    cb(null, {updatedAt: new Date(), updateMessage: juliaErrorMessage});
                } else {
                    cb(null, {updatedAt: new Date(), updateMessage: "Test completed without error but no data was generated"});
                }

            } catch (e) {
                console.log(e);
                cb(new Error("Test could not be completed"), {updateMessage:"Test could not be completed"});
            }
        }

        if(err) {
            console.log(err);
            cb(new Error("Test could not be completed"), {updateMessage:"Test could not be completed"});
        }
    });   
}

// Update foward test output data + serialized data to database
function updateForwardTestResult(forwardtestId, data) {
    console.log(`Updating Forward Test: ${forwardtestId}`);
    ForwardTestModel.updateForwardTest({
        _id: forwardtestId
    }, data);
}

// Function to cancel particular forward test
function cancelTest(forwardtestId) {
    // We will mark this forward test as inactive
    ForwardTestModel.updateForwardTest({
        _id: forwardtestId
    }, {active: false});
}

module.exports = {
    cancelTest,
    runForwardTest,
    runAllForwardTest
};
