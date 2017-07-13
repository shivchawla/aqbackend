'use strict';
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const schedule = require('node-schedule');
const ForwardTestModel = require('../models/forwardtest');

// Connection for forward tests
// Will have to add forward testing server details (host:port) in the config file
var ftmachine = config.get('ftmachines');
var ftConnection = 'ws://' + ftmachine.host + ":" + ftmachine.port;

// Forward test serialized data
var outputData = {};

/* =====================================
        FORWARD TEST CONTROL
===================================== */

// Schedule all the forward test jobs
// The following code will be executed at 0000 hours everyday
schedule.scheduleJob("0 0 * * *", function() {
    // Load all the forward tests from redis into forwardQueue
    let forwardQueue;
    ForwardTestModel.fetchForwardTests({
        active: true
    }, {})
    .then(ft => {
        // ft will be an array consisting of all active forward tests
        forwardQueue = ft.map(function(test) {
            return test._id;
        });
    })
    .catch(err => {
        console.error(err);
    });

    // Now, one-by-one, process each of the forward test
    if(forwardQueue) {
        // Start executing jobs starting from job number 0 upto the number of jobs - 1
        handleExecForwardTest(0, forwardQueue);
    }
});


// Forward test handler for running each forward test "synchronously"
function handleExecForwardTest(counter, tests) {
    if(counter >= tests.length) {
        console.log("All forward tests done!");
        return;
    }
    let currentTestID = tests[counter];
    execForwardTest(currentTestID, function(err, updateData) {
        if(err||updateData.status === "exception") {
            console.error("Error Occured:");
            console.error(err);
            updateForwardTestResult(forwardtestId, {status: "pending"});
        }
        else {
            // Update data for successful forward test run
            updateForwardTestResult(forwardtestId, updateData);
            // The current test is done
            // Start next forward test
            handleExecForwardTest(counter+1, tests);
        }
    });
}

// Forward test executer
// Will start running a forward test on the Julia server
function execForwardTest(forwardtestId, cb) {
    console.log('execForwardTest is called');

    ForwardTestModel.fetchForwardTest({
        _id: forwardtestId
    }, {})
    .then(ft => {
        if(!ft){
            throw new Error("Invalid Forward Test");
        }

        let args = [];

        args = args.concat(['--code', CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

        // If there is serialized data available then pass it as command line arg
        // Otherwise it's a fresh start
        if(ft.serializedData) {
            args = args.concat(['--data', ft.serializedData]);
        }
        else {
            // No deserialized data was found
            // to obtain the initial settings

            let settings = ft.settings;
            args = args.concat(['--capital', settings.initialCash]);
            args = args.concat(['--startdate', settings.startDate]);
            args = args.concat(['--enddate', settings.endDate]);
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

        return args;
    })
    .then(argArray => {

        outputData[forwardtestId] = [];
        let ftClient = new WebSocket(ftConnection);
        let algorithm = '';

        ftClient.on('open', function() {
            console.log('Connection Open');
            ftClient.send(argArray.join("??##"));
        });

        ftClient.on('message', function(data) {
            try {
                const dataJSON = JSON.parse(data);

                if (dataJSON.outputtype === 'serialized-data') {
                    algorithm = dataJSON;
                }
                else {
                    outputData[forwardtestId].push(dataJSON);
                }
            }
            catch (e) {
                console.log(e);
            }
        });

        ftClient.on('close', function close(code) {
            console.log('Connection Closed');

            // Update the connection status
            if (code === 1000) {
                cb(null, {serializedData: algorithm, output: outputData[forwardtestId], status: 'completed'});
            }
            else {
                cb(new Error("Test could not be completed"), {status: 'exception'});
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

module.exports = cancelTest;
