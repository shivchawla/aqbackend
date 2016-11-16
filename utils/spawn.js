'use strict';
const spawn = require('child_process').spawn;
    // child.stdout.setEncoding('utf8');
exports = module.exports = function(file, cb) {
    console.log('exec called');
    const child = spawn('julia', ['test.jl'], {cwd: './utils'});
    let totalData = '';
    child.stdout.on('data', function(data) {
        try {
            totalData = totalData + data;
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
                const jsonData = JSON.parse('[' + totalData + ']');
                cb(null, jsonData);
            } catch (e) {
                cb(e);
            }
        }
    });
};
