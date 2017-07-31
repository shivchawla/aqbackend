'use strict';
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var proxy = require('http-proxy-middleware');

// Port on which express-app will run (not the notebook app)
const app_port = 8000;

// Users directory where all users inside jail will be located
const users_dir = '/home/';

// Default notebook for the user
const default_notebook = 'Getting-Started.ipynb';

// Path for the default notebook
const default_notebook_path = '/home/kishlaya/projects/node-jupyter/Getting-Started.ipynb';

// Address and port where notebooks will run
const notebook_address = '127.0.0.1';
const notebook_starting_port = 12000;

// List all running notebooks
var notebooks = {};

// Ports occupied by the running notebooks
var portlist = {};

// Express setings

// JSON parsing for POST parameters
app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());

// Setting view engine to pug for delivering HTML files
app.set('view engine', 'pug');
app.set('views', './views');

// Proxy middleware
app.use('/user/:id/*', proxy({
    target: 'http://localhost:8000',    // default host
    changeOrigin: true,                 // needed for virtual hosted sites
    // pathRewrite: {
        // '^/user/(.)+' : '',             // rewrite path
    // },
    router: function(req) {
        let userID = req.params.id;
        if (notebooks.hasOwnProperty(userID)) {
            return 'http://' + notebook_address + ':' + notebooks[userID].port;
        }
    }
}));

// Express routes
app.get('/', function(req, res) {
    res.render('index');
});

app.post('/launch', function(req, res) {
    let userID = req.body.user;
    let password = req.body.password;

    if (!userID || !password) {
        // No userID or password provided
        res.render('error');
    }
    else if (notebooks.hasOwnProperty(userID)) {
        // Users notebook is already running
        res.render('notebook', {
            user: userID,
            baseUrl: 'http://localhost:' + notebooks[userID].port + '/user/' + userID + '/'
        });
    }
    else {
        // Setup notebook
        let dir = users_dir + userID;
        let start = function(userID, password) {
            start_notebook(userID, password, function(err) {
                if (err) {
                    res.send('Error occured: ' + err);
                }
                else {
                    // Render launch webpage
                    res.render('notebook', {
                        user: userID,
                        running: false,
                        baseUrl: 'http://localhost:' + notebooks[userID].port + '/user/' + userID + '/'
                    });
                }
            });
        };


        if (!fs.existsSync(dir)) {
            // New user
            // Create a workplace for user
            newUser(userID, password, start);
        }
        else {
            // Start the notebook app
            start(userID, password);
        }
    }
});

app.get('/exit', function(req, res) {
    let userID = req.query.user;
    if (notebooks.hasOwnProperty(userID)) {
        notebooks[userID].process.kill('SIGKILL');
        portlist[notebooks[userID].port] = false;
        notebooks[userID].process = null;
        delete notebooks[userID];
    }
    res.redirect('/');
});

app.get('/error', function(req, res) {
    res.send("Error Occurred! :(");
});

app.listen(app_port, function() {
	console.log("Listening on port " + app_port + "...");
});

// Helper functions

var getConfig = function(userID, password, port, notebook_dir) {
    port = port ? port : notebooks[userID].port;
    notebook_dir = notebook_dir ? notebook_dir :  users_dir + userID;

    return [
        '--ip=' + notebook_address,
        '--port=' + port,
        '--NotebookApp.allow_root=False',
        '--NotebookApp.default_url=/notebooks/' + default_notebook,
        '--NotebookApp.port_retries=0',
        '--notebook-dir=' + notebook_dir,
        '--NotebookApp.password=' + password,
        '--NotebookApp.password_required=True',
        '--MultiKernelManager.default_kernel_name=julia-0.5',
        '--NotebookApp.base_url=/user/' + userID,
        // '--ContentsManager.untitled_directory="Untitled Folder"',
        // '--ContentsManager.untitled_file="untitled"',
        // '--ContentsManager.untitled_notebook="Untitled"',
        '--no-browser'
    ];
};

function getPort(userID) {
    for(var i=notebook_starting_port;;i++) {
        if (!portlist[i]) {
            portlist[i] = true;
            return i;
        }
    }
}

function genPassword(password, next) {
    let command = "/usr/bin/python3 -c 'from notebook.auth import passwd; print(passwd(\"" + password + "\"))'";
    exec(command, function(err, data) {
        if (err) {
            next(err);
        } else {
            next(err, data.substring(0, data.length-1));
        }
    });
}

function start_notebook(userID, password, next) {
    // Setup user notebook process and port
    notebooks[userID] = {process: '', port: ''};

    // Get free port for user
    notebooks[userID].port = getPort();


    // Generate hashed password for user
    genPassword(password, function(err, hashed_password) {
        if (err) {
            console.log("Could not generate user password");
        } else {
            // Generate configurations for the customized notebook environment
            let config = getConfig(userID, hashed_password);

            // Launch jupyter notebook
            let cmd = 'jupyter-notebook ' + config.join(' ');
            // notebooks[userID].process = spawn('su', [userID, "\"" + cmd + "\""], {shell: true});
            // notebooks[userID].process = spawn('jupyter-notebook', config, {uid: 1002});
            notebooks[userID].process = exec("sudo -H -u " + userID + " bash -c '" + cmd + "'", function(err, stdout, stderr) {
                if (err) {
                    return console.error(stderr);
                }
            });

            // jupyter notebook logs
            /*notebooks[userID].process.stdout.on('data', function(data) {
                console.log('' + data);
            });
            notebooks[userID].process.stderr.on('data', function(data) {
                console.error('' + data);
            });*/
        }
        next(err);
    });
}

function newUser(userID, password, next) {
    exec('sudo bash ./scripts/adduser.sh ' + userID + ' ' + password, function(err, stdout, stderr) {
        if (err) {
            return console.error(err);
        }
        console.log("ADD_USER: " + stderr);
        next(userID, password);
    });
}
