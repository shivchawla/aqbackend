'use strict';
const spawn = require('child_process').spawn;
const StreamSplitter = require("stream-splitter");
const webSocket = require('ws');
//
// child.stdout.setEncoding('utf8');
exports = module.exports = function(file, cb) {
    console.log('exec called');
        
    var WebSocketServer = webSocket.Server
        , wss = new WebSocketServer({ port: 8000 });

    const child = spawn('/Applications/Julia-0.5.app/Contents/Resources/julia/bin/julia', ['test.jl'], {cwd: './utils'});
    let backtestData = '';
    //child.stdout.setEncoding('utf8');
    var splitter = child.stdout.pipe(StreamSplitter('\n')); 
    //child.stdout.on('data', function(data) {

    wss.on('connection', function connection(ws) {
        splitter.on('token', function(token) {
            try {
                
                var data = token.toString();
                var dataJSON = JSON.parse(data);
                
                if(dataJSON.outputtype == "backtest") {
                    backtestData = dataJSON;
                } else {
                    
                    console.log(ws.readyState);
                    if (ws.readyState == 1) {
                        ws.send(token.toString());
                    }
                }

            } catch (e) {
                cb(data, e);
            }
        });

        child.stderr.setEncoding('utf8');
        child.stderr.on('data', function(data) {
            console.log('this is the err', data);
            cb(data.trim());
        });

        child.on('close', function(code) {
            console.log('this is the code', code);
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
