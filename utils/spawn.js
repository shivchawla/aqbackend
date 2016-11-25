'use strict';
const spawn = require('child_process').spawn;
const StreamSplitter = require('stream-splitter');
const ws = require('../index').ws;

//
// child.stdout.setEncoding('utf8');
exports = module.exports = function(file, cb) {
    const child = spawn('/Applications/Julia-0.5.app/Contents/Resources/julia/bin/julia', ['test.jl'], {cwd: './utils'});
    let backtestData = '';
    // child.stdout.setEncoding('utf8');
    const splitter = child.stdout.pipe(StreamSplitter('\n'));
    // child.stdout.on('data', function(data) {

    ws.on('connection', function connection(res) {
        splitter.on('token', function(token) {
            let data;
            try {
                data = token.toString();
                const dataJSON = JSON.parse(data);

                if (dataJSON.outputtype === 'backtest') {
                    backtestData = dataJSON;
                } else {
                    if (res.readyState === 1) {
                        res.send(token.toString());
                    }
                }
            } catch (e) {
                cb(data, e);
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
                    wss.close();
                }
            }
        });
    });
};
