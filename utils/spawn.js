'use strict';
const spawn = require('child_process').spawn;
const StreamSplitter = require('stream-splitter');
const ws = require('../index').ws;
const jwtUtil = require('../utils/jwttoken');
const redisUtils = require('../utils/RedisUtils');
const BacktestModel = require('../models/backtest');
const StrategyModel = require('../models/strategy');

function exec(msg, res, cb) {

    var backtestId = msg.backtest_id;
    let child = '';
    let splitter = '';
    let backtestData = '';

    console.log('Exec is called too');

    BacktestModel.fetchBacktest({
        _id: backtestId
    })
    .then(bt => {
        var args = [];

        if(bt) {

            args = args.concat(['--code', bt.code]);

            //console.log(bt.code);

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

        for(var i=0;i<argArray.length;i++){
            console.log(argArray[i]);
        }

        child = spawn('/Applications/Julia-0.5.app/Contents/Resources/julia/bin/julia', ["/users/shivkumarchawla/Raftaar/Util/justrun.jl"].concat(argArray), {
            cwd: './utils'
        });

        splitter = child.stdout.pipe(StreamSplitter('\n'));

        splitter.on('token', function(token) {
            let data;
            try {

                data = token.toString();
                console.log(data)
                const dataJSON = JSON.parse(data);
                dataJSON.backtestId = msg.backtest_id;

                if (dataJSON.outputtype === 'backtest') {
                    backtestData = dataJSON;
                } else {
                    redisUtils.getValue(dataJSON.backtestId + '-data', function (err, data) {
                        if (err || !data) {
                            redisUtils.insertKeyValue(dataJSON.backtestId + '-data', JSON.stringify(dataJSON));
                            /**
                             * expiry in 1 hr
                             */
                            redisUtils.setDataExpiry(dataJSON.backtestId + '-data', 3600);
                            res.send(JSON.stringify(dataJSON));
                        } else {
                            data = JSON.parse(data);
                            data.push(dataJSON);
                            redisUtils.insertKeyValue(dataJSON.backtestId + '-data', JSON.stringify(data));
                            /**
                             * update expiry time
                             */
                            redisUtils.setDataExpiry(dataJSON.backtestId + '-data', 3600);
                            res.send(JSON.stringify(data));
                        }
                    }
            } catch (e) {
                //console.log("Parsing Error");
            }
        });

        child.stderr.setEncoding('utf8');

        child.stderr.on('data', function(data) {
            console.log(data.trim())
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
        console.log("Outside");
        console.log(err);
        cb(err);
        return;
    });
}

function updateBactestResult(updateData, msg) {
    console.log('this is called');
    BacktestModel.updateBacktestUpdated({
        _id: msg.backtest_id
    }, updateData);
}

ws.on('connection', function connection(res) {
    res.on('message', function(message) {
        let msg;
        console.log(message);
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

                redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                     if (err || !data) {
                        redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify([{data:msg, in_process:true}]));
                        execProcess(msg);
                    } else {
                        var queue = JSON.parse(data);

                        if(queue.length<3){
                            queue.push({data:msg, in_process:true});
                            execProcess(msg);
                        }else{
                            queue.push({data:msg, in_process:false});
                        }
                         redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(queue));
                     }
                    }
                }

                function execProcess(msg) {
                    if (msg.action === 'exec-backtest') {
                        return exec(msg, res, (err, data) = > {
                        var updateData;

                        if (err) {
                            updateData = {status: 'exception'};
                        } else {

                            if (data == '') {
                                updateData = {status: 'exception'};
                            } else {
                                updateData = {output: data, status: 'complete'};
                            }

                        }

                        redisUtils.getValue(msg['aimsquant-token'] + '-request-queue', function (err, data) {
                            if (data) {
                                var queue = JSON.parse(data);
                                for(var i=0; i<queue.length; i++){
                                    if(queue[i].data === msg){
                                        queue.splice(i,1);
                                        break;
                                    }
                                }
                                for(var i=0; i<queue.length; i++){
                                    if(queue[i].in_process === false){
                                        execProcess(queue[i].data);
                                        queue[i].in_process === true;
                                        break;
                                    }
                                }
                                redisUtils.insertKeyValue(msg['aimsquant-token'] + '-request-queue', JSON.stringify(queue));
                            }
                            updateBactestResult(updateData, msg);
                        }
                    });
                    }

                    else if (message === 'rl_close') {
                        return res.send('Not implemented');
                    }
                }
            });
    });
});
// child.stdout.setEncoding('utf8');
