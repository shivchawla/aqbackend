'use strict';
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const schedule = require('node-schedule');
const ForwardTestModel = require('../models/Research/forwardtest');

var isBusy = {};

// Initialize map for status of each connection
// Our Julia server can only accept one connection per process
for(var machine of config.get('ftmachines')) {
    let conn = 'ws://' + machine.host + ":" + machine.port;
    isBusy[conn] = false;
}
// Will have to add forward testing server details (host:port) in the config file

// Container for all pending forward tests
var forwardQueue = [];

/* =====================================
        FORWARD TEST CONTROL
===================================== */

// Manual trigger of a particular forward test
function runForwardTest(forwardtestId) {
    for(var server in isBusy) {
        if (isBusy.hasOwnProperty(server) && !isBusy[server]) {
            isBusy[server] = true;
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
                isBusy[server] = false;
                return;
            });
            break;
        }
    }
    console.log("No servers free at the moment");
}

// Schedule all the forward test jobs
// The following code will be executed at 0200 hours everyday
var schedulerString = config.get('ft_second') + " " + config.get('ft_minute') + " "+config.get('ft_hour')+ ' * * *';
schedule.scheduleJob(schedulerString, function() {
    runAllForwardTest();
});

function runAllForwardTest() {
    console.log("Trying running all forwardtests");
    // Load all the forward tests from redis into forwardQueue
    
    ForwardTestModel.fetchForwardTests({active: true, error: false}, {})
    .then(ft => {

        // ft will be an array consisting of all active forward tests
        forwardQueue = ft.map(item => item._id);

        if(forwardQueue.length > 0) {
            // Start execution of jobs on each free server
            Object.keys(isBusy).forEach(server => {
                if (!isBusy[server]) {
                    isBusy[server] = true;
                    handleExecForwardTest(server);
                }
            });
        }
    })
    .catch(err => {
        console.error(err);
    });
}

// Forward test handler for running each forward test "synchronously"
function handleExecForwardTest(connection) {
    if(forwardQueue.length <= 0) {
        isBusy[connection] = false;
        return;
    }

    // There are pending forward tests
    let forwardtestId = forwardQueue.shift();
    execForwardTest(forwardtestId, connection, function(err, updateData) {
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
        // The current test is done
        // Start next forward test on this connection
        handleExecForwardTest(connection);
    });
}

// Forward test executer
// Will start running a forward test on the Julia server
function execForwardTest(forwardtestId, connection, cb) {
    console.log('execForwardTest is called');

    ForwardTestModel.fetchForwardTest({
        _id: forwardtestId, active: true, error: false}, {})
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
            let settings = ft.settings;

            args = args.concat(['--capital', settings.initialCash]);
            
            var cd = ft.createdAt; 
            var startDate = cd.getFullYear()+"-"+(cd.getMonth()+1)+"-"+cd.getDate();    
            
            args = args.concat(['--startdate', startDate]);
            
            args = args.concat(['--universe', settings.universe]);

            let advanced = JSON.parse(settings.advanced);

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
                let commission = advanced.commission.model + ',' + advanced.commission.value.toString();
                args = args.concat(['--commission', commission]);
            }

            if(advanced.slippage) {
                let slippage = advanced.slippage.model + ',' + advanced.slippage.value.toString();
                args = args.concat(['--slippage', slippage]);
            }
        }

        // Add Code parameter
        args = args.concat(['--code', CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

        // And most importantly
        args = args.concat(['--forward', 'true']);

        return args;
    })
    .then(argArray => {

        let outputData = [];
        let algorithm = '';
        let ftClient = new WebSocket(connection);

        ftClient.on('open', function() {
            console.log('Connection Open');
            ftClient.send(argArray.join("??##"));
        });

        ftClient.on('message', function(data) {
            try {
                const dataJSON = JSON.parse(data);

                if (dataJSON.outputtype === 'serializedData') {
                    algorithm = dataJSON.algorithm;
                }
                else {
                    //SKIP rest of the ouput for 
                    //outputData.push(dataJSON);
                }
            }
            catch (e) {
                return console.error(e);
            }
        });

        ftClient.on('close', function close(code) {
            console.log('Connection Closed');

            //Update the connection status
            if (code === 1000) {
                //What if algorithm is empty?
                //this can happen for several reasons (when data connection was broken on 13092017)
                //and contaminate already serialized data 
                //Handle here instead in the model
                if(algorithm && Object.keys(algorithm).length > 0) {
                    cb(null, {serializedData: algorithm, updatedAt: new Date(), updateMessage:"Successfully updated"});
                } else {
                    cb(null, {updatedAt: new Date(), updateMessage: "Test couldn't complete for internal reasons"});
                }
            }
            else {
                cb(new Error("Test could not be completed"), {updateMessage:"Test could not be completed", error: true});
            }
        });
    })
    .catch(err => {
        cb(err, {status: 'exception'});
    });
}

// Update foward test output data + serialized data to database

function updateForwardTestResult(forwardtestId, data) {
    console.log("Updating Forward Test");
    ForwardTestModel.updateForwardTest({
        _id: forwardtestId
    }, data);
}

// FUnction to cancel particular forward test

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
