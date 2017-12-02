'use strict';
const redisUtils = require('../utils/RedisUtils');
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const schedule = require('node-schedule');
const ForwardTestModel = require('../models/Research/forwardtest');
const SettingsParser = require('./btSettings.js');
const serverPort = require('../index').serverPort;

var numRejections = {};
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
        }
        else {
            // Update data for successful forward test run
            updateForwardTestResult(forwardtestId, updateData);
        }

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
                numRejections[forwardtestId] = 0;
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
        let ftClient = new WebSocket(connection);
        var redis = require("redis")
                  , subscriber = redis.createClient()
                  , publisher  = redis.createClient();

        var juliaError = false;
        var internalError = false;
        var juliaErrorMessage = '';

        ftClient.on('open', function() {
            console.log('Connection Open');
            //console.log(argArray);
            ftClient.send(JSON.stringify({args:argArray.join("??##"), requestType:"execute"}));
        });

        ftClient.on('message', function(data) {
            //Now only called when connection is refused
            //Now, real-time data comes through Redis PUB/SUB
            try {
                const dataJSON = JSON.parse(data);

                if(dataJSON.outputtype === "internal") {
                    if(dataJSON.code == 503) {
                        serverDeniedRequest = true;
                        
                        numRejections[forwardtestId] == numRejections[forwardtestId] + 1;

                        if(numRejections[forwardtestId] % config.get('ftmachines').length != 0) {
                            console.log(`Server: ${connection} is unavailable. Moving to next connection`);
                            handleExecForwardTest(forwardtestId);
                        } else {
                            console.log("All Servers Unavailable!! Will retry in 1 minute");
                            setTimeout(function(){handleExecForwardTest(forwardtestId)}, 60000);
                        }

                        return;

                    } else if(dataJSON.code == 200) {
                        //Request Accepted
                        subscriber.subscribe(`backtest-final-${forwardtestId}`);
                        subscriber.subscribe(`backtest-realtime-${forwardtestId}`);
                    }
                }
            }
        });

        subscriber.on("message", function(channel, message) {
            if(channel.indexOf("backtest-final") != -1) {
                var incomingForwardtestId = channel.split("-")[2];
                 
                if(message == "backtest-final-output-ready") {
                    //Convert concatenated message to JSON
                    try {
                        forwardData = JSON.parse(forwardData);
                    
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
                        cb(new Error("Test could not be completed"), {updateMessage:"Test could not be completed", error: true});
                    }    
                } else {
  
                    try {
                        forwardData = forwardData.concat(message);
                    } catch(e) {
                        console.log(e);
                    }
                }
            } else if(channel.indexOf("backtest-realtime") != -1) {
                var incomingForwardtestId = channel.split("-")[2];
                const dataJSON = JSON.parse(message);
                
                if(dataJSON.outputtype === 'log' && dataJSON.messagetype === "ERROR") {
                    juliaError = true;
                    juliaErrorMessage = dataJSON.message;
                } else if(dataJSON.outputtype === "internal") {
                    internalError = true; 
                }
            }
        });
    })
    .catch(err => {
        cb(err, {status:"exception"});
    });
}

// Update foward test output data + serialized data to database
function updateForwardTestResult(forwardtestId, data) {
    console.log("Updating Forward Test");
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
