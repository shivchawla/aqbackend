'use strict';
var redis = require("redis");
const RedisUtils = require('../../utils/RedisUtils');
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const schedule = require('node-schedule');
const ForwardTestModel = require('../../models/Research/forwardtest');
const SettingsParser = require('./btSettings.js');
const serverPort = require('../../index').serverPort;
const Promise = require('bluebird');
const _ = require('lodash');
const APIError = require('../../utils/error');
const DateHelper = require('../../utils/Date');

const FORWARDTEST_QUEUE = `backtest-request-queue-${process.env.NODE_ENV}`;
const THIS_PROCESS_FORWARDTEST_SET = `forwardtest-request-set-${serverPort}`;
const COMPLETE_FORWARDTEST_SET  = `backtest-completion-set-${process.env.NODE_ENV}`;

// Schedule all the forward test jobs
var schedulerString = config.get('ft_second') + " " + config.get('ft_minute') + " "+config.get('ft_hour')+ ' * * *';

if (serverPort == config.get('jobsPort')) {
    schedule.scheduleJob(schedulerString, function() {
        runAllForwardTests();
    });

    setTimeout(reSubscribeAfterConnection, 5000);
}

var redisClient;
var redisSubscriber;
var juliaError = {};

function finalOutputChannel(forwardtestId) {
    return `backtest-final-${forwardtestId}`;
}

function realtimeOutputChannel(forwardtestId) {
    return `backtest-realtime-${forwardtestId}`;
}

function getRedisClient() {
    if (!redisClient || !redisClient.connected) {
        redisClient = redis.createClient(config.get('julia_redis_port'), config.get('julia_redis_host'), {password: config.get('julia_redis_pass')});
        
        redisClient.on("ready", function() {

            // Let's retrieve pending backtest requests from Redis for this process
            return RedisUtils.getAllFromRedis(redisClient, THIS_PROCESS_FORWARDTEST_SET)
            .then(data => {
               
                if (!data) {
                    // Redis is empty
                    return;
                }

                //Re-subscribe to the channels
                return Promise.mapSeries(Object.keys(data), function(key) {
                    var req = JSON.parse(data[key]);

                    var nodePort = req.nodePort;
                    
                    //Request is passed with ***backtestId**
                    var forwardtestId = req.backtestId;

                    if (nodePort != serverPort || !forwardtestId)  {
                        console.log("Error while fetching requests for this process");
                    }

                    //Fetch the status of this backtest, in Completion Set
                    return RedisUtils.getFromRedis(redisClient, COMPLETE_FORWARDTEST_SET, forwardtestId)
                    .then(found => {
                        if (found) {
                            return saveData(forwardtestId);
                        }

                        //Other-wise subscribe;
                        juliaError[forwardtestId] = false;
                        return handleRedisSubscription(forwardtestId);
                    })
                    
                });
            })
            .catch(err => {
                console.error(`Error reading active requests from redist set: ${serverPort}`);
                console.log(err);
            })
        });

        redisClient.on("message", function(channel, message) {
            
            var forwardtestId = channel.split("-")[2];

            if(channel.indexOf("backtest-realtime") != -1) {     
                try {
                    const dataJSON = JSON.parse(message);
                
                    if(dataJSON.outputtype === 'log' && dataJSON.messagetype === "ERROR") {
                        juliaError[forwardtestId] = true;
                    } else if(dataJSON.outputtype === "internal") {
                        juliaError[forwardtestId] = true;
                    }
                }
                catch (e) {
                    console.log(e);
                }
            }

            if(channel.indexOf("backtest-final") != -1) {
                setTimeout(function(){saveData(forwardtestId);}, 1000);    
            }
        });
    } 

    return redisClient;
}

function getRedisSubscriber() {
    if (!redisSubscriber || !redisSubscriber.connected) {
        redisSubscriber = redis.createClient(config.get('julia_redis_port'), config.get('julia_redis_host'), {password: config.get('julia_redis_pass')});
        
        redisSubscriber.on("ready", function() {

            // Let's retrieve pending backtest requests from Redis for this process
            return RedisUtils.getAllFromRedis(getRedisClient(), THIS_PROCESS_FORWARDTEST_SET)
            .then(data => {
               
                if (!data) {
                    // Redis is empty
                    return;
                }

                //Re-subscribe to the channels
                return Promise.mapSeries(Object.keys(data), function(key) {
                    var req = JSON.parse(data[key]);

                    var nodePort = req.nodePort;
                    
                    //Request is passed with ***backtestId**
                    var forwardtestId = req.backtestId;

                    if (nodePort != serverPort || !forwardtestId)  {
                        console.log("Error while fetching requests for this process");
                    }

                    //Fetch the status of this backtest, in Completion Set
                    return RedisUtils.getFromRedis(getRedisClient(), COMPLETE_FORWARDTEST_SET, forwardtestId)
                    .then(found => {
                        if (found) {
                            return saveData(forwardtestId);
                        }

                        //Other-wise subscribe;
                        juliaError[forwardtestId] = false;
                        return handleRedisSubscription(forwardtestId);
                    })
                    
                });
            })
            .catch(err => {
                console.error(`Error reading active requests from redist set: ${serverPort}`);
                console.log(err);
            })
        });

        redisSubscriber.on("message", function(channel, message) {
            
            var forwardtestId = channel.split("-")[2];

            if(channel.indexOf("backtest-realtime") != -1) {     
                try {
                    const dataJSON = JSON.parse(message);
                
                    if(dataJSON.outputtype === 'log' && dataJSON.messagetype === "ERROR") {
                        juliaError[forwardtestId] = true;
                    } else if(dataJSON.outputtype === "internal") {
                        juliaError[forwardtestId] = true;
                    }
                }
                catch (e) {
                    console.log(e);
                }
            }

            if(channel.indexOf("backtest-final") != -1) {
                setTimeout(function(){saveData(forwardtestId);}, 1000);    
            }
        });
    } 

    return redisSubscriber;
}

/* =====================================
        FORWARD TEST CONTROL
===================================== */

function processArguments(ft) {

    var forwardtestId = ft._id.toString();

     //Filter data to send only the relevant data
    ft = ft.serializedData ? filterForwardTest(ft.toObject()) : ft;

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
                lastdate.setDate(lastdate.getDate() + 1);
                var startDate = DateHelper.formatDate(new Date(lastdate)); 

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
}

// Manual trigger of a particular forward test
function runForwardTest(forwardtestId) {
    return ForwardTestModel.fetchForwardTest({_id: forwardtestId, active:true, error:false, deleted:false}, {})
    .then(ft => {
        if(!ft) {
                console.log("Invalid Forward Test");
            }

            var forwardtestId = ft._id.toString();

            var argArray = processArguments(ft);

            let req = {};

            req.backtestId = forwardtestId
            req.argArray = argArray;

            // epoch time (measure for time of request)
            req.requestTime = (new Date()).getTime();

            // userId of the requesting user
            req.userId = st.user._id;

            // Date range for the simulation
            req.date_range = new Date(bt.settings.endDate) - new Date(bt.settings.startDate);

            req.nodePort = serverPort;

            return saveForwardTestRequestInQueue(req, forwardtestId);
    })
}

function runAllForwardTests() {
    return ForwardTestModel.fetchForwardTests({active:true, error:false, deleted:false}, {})
    .then(allFts => {
        return Promise.mapSeries(allFts, function(ft) {
            return runForwardTest(ft);
        })
        .catch(err => {
            console.error("Error occured: " + err);
        });
    })
}

function saveForwardTestRequestInQueue(req, forwardtestId) {
    console.log("Adding forward test request to redis queue");

    return Promise.all([
        RedisUtils.pushToRangeRedis(getRedisClient(), FORWARDTEST_QUEUE, JSON.stringify(req)),
        RedisUtils.insertIntoRedis(getRedisClient(), THIS_PROCESS_FORWARDTEST_SET, forwardtestId, JSON.stringify(req))
    ])
    .catch(err => {
        console.error(err);
    });
}

//Filter the forward test request object before sending
//A lot of information is not required while computing next step of forward-test
function filterForwardTest(fTest) {
    const nFt = Object.assign({}, fTest);

    //Filter out VariableTracker LogTracker TransactionTracker OrderTracker
    //Keep Performance/Benchmark Tracker
    //And last element of account tracker - Is this required?
    var serializedData = nFt.serializedData;
     
    delete serializedData.variabletracker;
    delete serializedData.logtracker;
    delete serializedData.transactiontracker;
    delete serializedData.ordertracker;
    
     //Also, just send the latest Cash Tracker and Account Tracker
    var allCashDates = Object.keys(serializedData.cashtracker).map(item => new Date(item).getTime()).sort();
    var lastCashDate = allCashDates.length > 0 ? DateHelper.formatDate(new Date(allCashDates.slice(-1)[0])) : null;
    serializedData.cashtracker = lastCashDate ? {[lastCashDate]: serializedData.cashtracker[lastCashDate]} : null;

    var allAccountDates = Object.keys(serializedData.accounttracker).map(item => new Date(item).getTime()).sort();
    var lastAccountDate = allAccountDates.length > 0 ? DateHelper.formatDate(new Date(allAccountDates.slice(-1)[0])) : null;
    serializedData.accounttracker = lastAccountDate ? {[lastAccountDate]:serializedData.accounttracker[lastAccountDate]} : {};

    return nFt;
}

function handleRedisSubscription(forwardtestId) {

    if (forwardtestId) {
        RedisUtils.subscribe(getRedisSubscriber(), finalOutputChannel(forwardtestId));
        RedisUtils.subscribe(getRedisSubscriber(), realtimeOutputChannel(forwardtestId));

    } else {
        console.log("Invalid forwardId provided");
    }
}

function reSubscribeAfterConnection() {
    getRedisSubscriber();
}

function saveData(forwardtestId) {
    
    return new Promise(resolve => {
    //Fetch all the data from the redis Queue "backtest-final-${forwardtestId}"
        Promise.resolve()
        .then(() => {
            if (!_.get(juliaError, forwardtestId, false)) {
                return RedisUtils.getRangeFromRedis(getRedisClient(), finalOutputChannel(forwardtestId), 0 , -1);
            } else {
                throw new Error ("Julia Error");
            }
        }).
        then(() => {
            return RedisUtils.getRangeFromRedis(getRedisClient(), finalOutputChannel(forwardtestId), 0 , -1);
        })
        .then(data => {

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
                        return {serializedData: algorithm, updatedAt: new Date(), updateMessage:"Successfully updated"};
                    } else if (internalError) {
                        return {updatedAt: new Date(), updateMessage: "Test couldn't complete for internal reasons"};
                    } else if (juliaError) {
                        return {updatedAt: new Date(), updateMessage: juliaErrorMessage};
                    } else {
                        return {updatedAt: new Date(), updateMessage: "Test completed without error but no data was generated"};
                    }

                } catch (e) {
                    console.log(e);
                    resolve({message: "Test could not be completed"});
                }
            }
        })
        .then(updateData => {
            resolve(updateForwardTestResult(forwardtestId, updateData));
        })
        .catch(err => {
            console.log("Forward Test: Error in save data. Unhandled!!!")
            resolve(true);
        });
    })
    .then(() => {
        //remove julia error status
        delete juliaError[forwardtestId];
        
        // Delete this backtest from redis (from this process SET)
        return Promise.all([
            RedisUtils.deleteFromRedis(getRedisClient(), THIS_PROCESS_FORWARDTEST_SET, forwardtestId),
            RedisUtils.deleteFromRedis(getRedisClient(), COMPLETE_FORWARDTEST_SET, forwardtestId)
        ])
        .then(() => {
            
            //Expire the channels
            RedisUtils.setDataExpiry(getRedisClient(), realtimeOutputChannel(forwardtestId), 20);
            RedisUtils.setDataExpiry(getRedisClient(), finalOutputChannel(forwardtestId), 1);

            //Unsubscribe the channels
            RedisUtils.unsubscribe(getRedisSubscriber(), realtimeOutputChannel(forwardtestId));
            RedisUtils.unsubscribe(getRedisSubscriber(), finalOutputChannel(forwardtestId));

        })
        .catch(err => {
            return console.error(err);
        })
    })
};

// Update foward test output data + serialized data to database
function updateForwardTestResult(forwardtestId, newData) {
    console.log(`Updating Forward Test: ${forwardtestId}`);
    
    //We will merge the data with exisiting Object
    //This is because incoming serialed data has JUST THE LATEST data
    //for MOST entities
    return Promise.resolve()
    .then(() => {
        if(newData && newData.serializedData) { 
            return ForwardTestModel.fetchForwardTest(
                {_id: forwardtestId, active: true, error: false, deleted: false}, 
                {select: 'serializedData'});
        } else {
            return null;
        }
    })
    .then(ft => {
        var updatedData = ft ? _.merge(ft.toObject(), newData) : newData;

        return ForwardTestModel.updateForwardTest({
            _id: forwardtestId}, updatedData);
    });
}

// Function to cancel particular forward test (this should be DONE via REST)
function cancelTest(forwardtestId) {
    // We will mark this forward test as inactive
    ForwardTestModel.updateForwardTest({
        _id: forwardtestId
    }, {active: false});
}

module.exports = {
    cancelTest,
    runForwardTest,
    runAllForwardTests
};
