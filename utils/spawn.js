'use strict';
const spawn = require('child_process').spawn;
const StreamSplitter = require('stream-splitter');
const ws = require('../index').ws;
const jwtUtil = require('../utils/jwttoken');
const BacktestModel = require('../models/backtest');
const StrategyModel = require('../models/strategy');
var CryptoJS = require("crypto-js");
const config = require('config');


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

        child = spawn('julia', ["../../raftaar/util/justrun.jl"].concat(argArray), {
            cwd: './utils'
        });

        splitter = child.stdout.pipe(StreamSplitter('\n'));

        splitter.on('token', function(token) {
            let data;
            try {
                
                data = token.toString();
                dataJSON.backtestId = msg.backtestId;
                
                if (dataJSON.outputtype === 'backtest') {
                    backtestData = dataJSON;
                } else {
                    res.send(JSON.stringify(dataJSON));
                }
            } catch (e) {
                //console.log("Parsing Error");
            }
        });

        child.stderr.setEncoding('utf8');
        
        child.stderr.on('data', function(data) {
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
        return;
    });
}

function updateBactestResult(updateData, msg) {
    console.log('this is called');
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
            console.log(e);
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

                if (msg.action === 'exec-backtest') {
                    return exec(msg, res, (err, data) => {
                        var updateData;
                        
                        if(err){
                            updateData = {status : 'exception'};
                        } else {
                            
                            if(data=='') {
                                 updateData = {status : 'exception'};
                            } else {
                                updateData = {output : data, status:'complete'};    
                            }
                            
                        }

                        updateBactestResult(updateData, msg);
                    });
                } else if (message === 'rl_close') {
                    return res.send('Not implemented');
                }
            });
    });
});
// child.stdout.setEncoding('utf8');
