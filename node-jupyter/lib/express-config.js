'use strict';
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

var globals = require('./globals');
var helper = require('./helper');

app.set('view engine', 'pug');
app.set('views', './views');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', function(req, res) {
    // res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    // res.header("Pragma", "no-cache");
    // res.header("Expires", 0);
    res.render('index');
});

app.post('/launch', function(req, res) {
    let userID = req.body.user;
    let password = req.body.password;

    if (!userID) {
        res.render('error');
    }
    else if (globals.notebooks.hasOwnProperty(userID)) {
        res.render('notebook', {
            user: userID,
            running: true,
            baseUrl: "http://" + globals.notebook_address + ":" + globals.notebooks[userID].port + globals.base_url + userID
        });
    }
    else {
        // Create a workplace for user
        let dir = globals.users_dir + userID;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
            exec('cp ' + globals.default_notebook + ' ' + dir, function(err, stderr, stdout) {
                if (err) {
                    return console.error(err);
                }
            });
        }

        // Setup user notebook process and port
        globals.notebooks[userID] = {process: '', port: ''};

        // Get free port for user
        globals.notebooks[userID].port = helper.getPort();


        // Generate hashed password for user
        helper.genPassword(password, function(err, hashed_password) {
            if (err) {
                console.log("Could not generate user password");
            } else {
                // Generate configurations for the customized notebook environment
                let config = helper.getConfig(userID, hashed_password);

                // Launch jupyter notebook
                globals.notebooks[userID].process = spawn('jupyter', config);

                // Uncomment this for logs from jupyter
                globals.notebooks[userID].process.stdout.on('data', function(data) {
                    console.log('' + data);
                });
                globals.notebooks[userID].process.stderr.on('data', function(data) {
                    console.error('' + data);
                });
            }
        });

        // Render launch webpage
        res.render('notebook', {
            user: userID,
            running: false,
            baseUrl: 'http://' + globals.notebook_address + ':' + globals.notebooks[userID].port + globals.base_url + userID
        });
    }
});

app.get('/exit', function(req, res) {
    let userID = req.query.user;
    if (globals.notebooks.hasOwnProperty(userID)) {
        globals.portlist[globals.notebooks[userID].port] = false;
        globals.notebooks[userID].process.stdin.pause();
        globals.notebooks[userID].process.kill();
        delete globals.notebooks[userID];
    }
    res.redirect('/');
});

module.exports = app;
