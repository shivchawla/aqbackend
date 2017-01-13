'use strict';
const spawn = require('child_process').spawn;
const StreamSplitter = require('stream-splitter');
const ws = require('../index').ws;
const jwtUtil = require('../utils/jwttoken');
const BacktestModel = require('../models/backtest');
const StrategyModel = require('../models/strategy');

function exec(msg, res, cb) {

    var argArray = [];
    var backtestId = msg.backtest_id;

    BacktestModel.fetchBacktest({
        _id: backtestId
    })
    .then(bt => {
        if(bt) {

            console.log(bt);

            var settings = bt.settings;
            argArray.concat(['--capital', settings.initialCash]);
            argArray.concat(['--startdate', settings.startDate]);
            argArray.concat(['--enddate', settings.endDate]);
            argArray.concat(['--universe', settings.universe]);
            
            var advanced = JSON.parse(settings.advanced);

            console.log(advanced);

            if(advanced.exclude) {
                argArray.concat(['--exclude', advanced.exclude]);    
            }

            if(advanced.investmentplan) {
                argArray.concat(['--investmentplan', advanced.investmentPlan]);
            }

            if(advanced.rebalance) {
                argArray.concat(['--rebalance', advanced.rebalance]);
            }
            
            if(advanced.cancelpolicy) {
                argArray.concat(['--cancelpolicy', advanced.cancelPolicy]);
            }
            
            if(advanced.resolution) {
                argArray.concat(['--resolution', advanced.resolution]);
            }
            
            if(advanced.commission) {
                argArray.concat(['--commission', advanced.commission]);
            }
            
            if(advanced.slippage) {
                argArray.concat(['--slippage', advanced.slippage]);
            }

            var strategyId = bt.strategy;

            StrategyModel.fetchStrategy({
                _id: strategyId
            }).then(strategyObj => {
                if(strategyObj) {
                    argArray.concat(['--code', strategyObj.code]);
                }
            });
        }
    })
    .catch(err => {
        console.log(err);
        cb(err);
        return;
    });

    console.log(argArray);

    const child = spawn('julia', ["C:/Users/schawla/Documents/raftaar/Util/justrun.jl"].concat(argArray), {
        cwd: './utils'
    });
    let backtestData = '';
    // child.stdout.setEncoding('utf8');
    const splitter = child.stdout.pipe(StreamSplitter('\n'));
    // child.stdout.on('data', function(data) {
    splitter.on('token', function(token) {
        let data;
        try {
            data = token.toString();
            const dataJSON = JSON.parse(data);
            dataJSON.backtestId = msg.backtest_id;
            if (dataJSON.outputtype === 'backtest') {
                backtestData = dataJSON;
            } else {
                res.send(JSON.stringify(dataJSON));
            }
        } catch (e) {
            console.log(e);
        }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', function(data) {
        cb(data.trim());
    });

    child.on('close', function(code) {
        if (code === 0) {
            try {
                cb(null, backtestData);
            } catch (e) {
                cb(e);
            } finally {
                // ws.close();
            }
        }
    });
}

function updateBactestResult(updateData, msg) {
    //console.log('this is called ', updateData);
    BacktestModel.updateBacktestUpdated({
        _id: msg.backtest_id
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
                backtest_id: 'afd'
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
                            console.log(err);
                            updateData = {status : 'exception'}
                        }else{
                            updateData = {output : data, status : 'complete'}
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
