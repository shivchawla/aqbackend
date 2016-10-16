'use strict';
const spawn = require('child_process').spawn;
const MongoClient = require('mongodb').MongoClient;
const config = require('config');
const url = config.get('mongo_url');

let dbClient;
MongoClient.connect(url, function(err, db) {
    dbClient = db;
});

// a program is allowed for a max period of 20 minutes
const pyshell = spawn('python', ['packet_sniffer.py'], {
    timeout: 20*60*1000 // 20 minutes
});

pyshell.stdout.on('data', message => {
    // each line the program prints should be a perfect json
    // if not the json will not be stored and not available for
    // analytics
    const parts = ('' + message).split(/\n/g);
    parts.forEach(part => {
        try {
            const data = JSON.parse(part);
            if (dbClient) {
                const collection = dbClient.collection('Packet');
                collection.insert({
                    data: data
                });
            }
        } catch (e) {
            //
        }
    });
});
