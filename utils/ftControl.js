'use strict';
const CryptoJS = require('crypto-js');
const config = require('config');
const WebSocket = require('ws');
const schedule = require('node-schedule');
const ForwardTestModel = require('../models/forwardtest');

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
function runForwardTest(msg) {
    let forwardtestId = msg.forwardtestId;
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
        }
    }
    console.log("No servers free at the moment");
}

// Schedule all the forward test jobs
// The following code will be executed at 0000 hours everyday
schedule.scheduleJob("0 0 * * *", function() {
    runAllForwardTest();
});

function runAllForwardTest() {
    // Load all the forward tests from redis into forwardQueue
    ForwardTestModel.fetchForwardTests({
        active: true
    }, {})
    .then(ft => {
        // ft will be an array consisting of all active forward tests
        forwardQueue = ft.map(function(test) {
            return test._id;
        });

        if(forwardQueue.length > 0) {
            // Start execution of jobs on each server
            /* ================================================================
                ASSUMPTION: All the servers are available for accepting tasks
            ================================================================ */
            Object.keys(isBusy).forEach(function(server) {
                // Start multiple instances of handleExecForwardTest()
                // One for each free server
                if (!isBusy[server]) {
                    isBusy[server] = true;
                    handleExecForwardTest(server);
                }
            });
            // handleExecForwardTest(0, forwardQueue);
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
        _id: forwardtestId
    }, {})
    .then(ft => {
        if(!ft){
            throw new Error("Invalid Forward Test");
        }

        let args = [];

        // args = args.concat(['--code', CryptoJS.AES.decrypt(ft.code, config.get('encoding_key')).toString(CryptoJS.enc.Utf8)]);

        args = args.concat(['--code', 'using Raftaar\n function initialize(state)\n 	setstartdate(DateTime("21/12/2015","dd/mm/yyyy"))\n 	setenddate(DateTime("21/12/2015","dd/mmm/yyyy"))\n 	setcash(1000000.0)\n 	setresolution("Day")\n 	setcancelpolicy(CancelPolicy(EOD))\n 	setbenchmark("JBFIND")\n 	setuniverse("RANASUG")\n end\n function ondata(data, state)\n 	setholdingpct("RANASUG", 0.5)	\n 	track("portfoliovalue", state.account.netvalue)\n end\n ']);

        // If there is serialized data available then pass it as command line arg
        // Otherwise it's a fresh start
        if(ft.serializedData) {
            args = args.concat(['--serializedData', JSON.stringify(ft.serializedData)]);
        }
        else {
            // No deserialized data was found
            // to obtain the initial settings

            let settings = ft.settings;
            args = args.concat(['--capital', settings.initialCash]);
            args = args.concat(['--startdate', settings.startDate]);
            args = args.concat(['--enddate', settings.endDate]);
            args = args.concat(['--universe', settings.universe]);

            let advanced = settings.advanced;

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

        // And most importantly
        args = args.concat(['--forward', 'true']);

        return args;
    })
    .then(argArray => {

        let outputData;
        let algorithm = '';
        let ftClient = new WebSocket(connection);

        ftClient.on('open', function() {
            console.log('Connection Open');
            console.log("Connection = " + connection);
            ftClient.send(argArray.join("??##"));
        });

        ftClient.on('message', function(data) {
            console.log("Incoming Message");
            try {
                let dataCollection = data.split("\n");
                dataCollection.forEach(function(data) {
                    if(!data) {
                        return;
                    }
                    let x = JSON.parse(data);
                    if (x.outputtype === 'serializedData') {
                        algorithm = x.algorithm;
                    }
                    else {
                        outputData = x;
                    }
                });
            }
            catch (e) {
                console.log(e);
            }
            /*
            try {
                const dataJSON = JSON.parse(data);

                if (dataJSON.outputtype === 'serializedData') {
                    algorithm = dataJSON.algorithm;
                }
                else {
                    outputData = dataJSON;
                }
            }
            catch (e) {
                console.log(e);
            }*/
        });

        ftClient.on('close', function close(code) {
            console.log('Connection Closed');

            // Update the connection status
            if (code === 1000) {
                cb(null, {serializedData: algorithm, output: outputData});
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

module.exports = {
    cancelTest,
    runForwardTest,
    runAllForwardTest
};
