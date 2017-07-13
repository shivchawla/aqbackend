'use strict';
const CryptoJS = require("crypto-js");
const config = require('config');
const WebSocket = require('ws');
const BacktestModel = require('../models/backtest');
const ForwardTestModel = require('../models/forwardtest');

// Connection for forward tests
// Will have to add forward testing server details (host:port) in the config file
var ftmachine = config.get('ftmachines');
var ftConnection = 'ws://' + ftmachine.host + ":" + ftmachine.port;

// Forward test serialized data
var forwardTestOutputData = {};

/* =====================================
        FORWARD TEST CONTROL
===================================== */

// Forward test handler for running each forward test "synchronously"
function handleExecForwardTest(counter, jobs) {
    if(counter >= jobs.length) {
        console.log("All forward tests done!");
        return;
    }
    let currentJob = jobs[counter];
    execForwardTest(currentJob, function(err) {
        if(err) {
            console.error("Error Occured:");
            console.error(err);
        }
        else {
            // The current test is done
            // Start next forward test
            handleExecForwardTest(counter+1, jobs);
        }
    });
}

// Forward test executer
// Will start running a forward test on the Julia server
function execForwardTest(msg, cb) {
    console.log('execForwardTest is called');

    ForwardTestModel.fetchForwardTest({
        _id: msg.forwardtestId
    }, {})
    .then(ft => {
        var args = [];

        if(!ft){
            throw new Error("Invalid Forward Test");
        }

        args = args.concat(['--code', CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

        // If there is serialized data available then pass it as command line arg
        // Otherwise it's a fresh start
        if(ft.serializedData) {
            args = args.concat(['--data', ft.serializedData]);
        }
        else {
            // No deserialized data was found
            // Let us lookup the backtest model for corresponding backtest
            // To obtain the initial settings

            BacktestModel.fetchBacktest({
                _id: ft.backtestId
            }, {})
            .then(bt => {
                if(!bt) {
                    throw new Error("Corresponding Backtest not found");
                }

                let settings = bt.settings;
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
            });
        }

        return args;
    })
    .then(argArray => {

        let forwardtestId = msg.forwardtestId;
        forwardTestOutputData[forwardtestId] = [];
        let ftClient = new WebSocket(ftConnection);

        ftClient.on('open', function() {
            console.log('Connection Open');
            ftClient.send(argArray.join("??##"));
        });

        ftClient.on('message', function(data) {
            try {
                const dataJSON = JSON.parse(data);
                forwardTestOutputData[forwardtestId].push(dataJSON);
            }
            catch (e) {
                console.log(e);
            }
        });

        ftClient.on('close', function close(code) {
            console.log('Connection Closed');

            // Update the connection status
            if (code === 1000) {
                updateForwardTestResult({serializedData: forwardTestOutputData[forwardtestId]}, msg);
                cb(null);
            }
            else {
                cb("Test could not be completed");
            }
        });

    })
    .catch(err => {
        cb(err);
    });
}

// UPDATE FORWARD TEST SERIALIZED OUTPUT TO DATABASE

function updateForwardTestResult(data, msg) {
    console.log("Updating Forward Test");
    ForwardTestModel.updateForwardTest({
        _id: msg.forwardtestId
    }, data);
}

module.exports = {
    handleExecForwardTest
}
