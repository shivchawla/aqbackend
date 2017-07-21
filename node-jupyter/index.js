'use strict';
var express = require('express');
var app = express();
var fs = require('fs');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

const port = 8080;
const users_dir = '/home/kishlaya/users/';
const default_notebook = '/home/kishlaya/IJulia/GettingStarted.ipynb';
const notebook_address = '127.0.0.1';
var notebooks = {};
var portlist = {};

app.set('view engine', 'pug');
app.set('views', './views');

app.get('/', function(req, res) {
    // res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    // res.header("Pragma", "no-cache");
    // res.header("Expires", 0);
    res.render('index');
});

app.get('/launch', function(req, res) {
    let userID = req.query.user;
    if (!userID) {
        res.render('error');
    }
    else if (notebooks.hasOwnProperty(userID)) {
        res.render('notebook', {user: userID, running: true, baseUrl: "http://" + notebook_address + ":" + notebooks[userID].port});
    }
    else {
        // Create a workplace for user
        let dir = users_dir + userID;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
            exec('cp ' + default_notebook + ' ' + dir, function(err, stderr, stdout) {
                if (err) {
                    return console.error(err);
                }
            });
        }

        // Setup user notebook process and port
        notebooks[userID] = {process: '', port: ''};

        // Get free port for user
        notebooks[userID].port = getPort();

        // Launch jupyter notebook
        notebooks[userID].process = spawn('jupyter', ['notebook', '--ip=' + notebook_address, '--port=' + notebooks[userID].port ,'--notebook-dir=' + dir]);

        res.render('notebook', {user: userID, running: false, baseUrl: "http://" + notebook_address + ":" + notebooks[userID].port});

        // Uncomment this for logs from jupyter
        /*notebooks[userID].process.stdout.on('data', function(data) {
            console.log('' + data);
        });
        notebooks[userID].process.stderr.on('data', function(data) {
            console.error('' + data);
        });*/
    }
});

app.get('/exit', function(req, res) {
    let userID = req.query.user;
    if (notebooks.hasOwnProperty(userID)) {
        portlist[notebooks[userID].port] = false;
        notebooks[userID].process.stdin.pause();
        notebooks[userID].process.kill();
        delete notebooks[userID];
    }
    res.redirect('/');
});

app.listen(port, function() {
	console.log("Listening on port " + port + "...");
});

function getPort(userID) {
    for(var i=12000;;i++) {
        if (!portlist[i]) {
            portlist[i] = true;
            return i;
        }
    }
}
