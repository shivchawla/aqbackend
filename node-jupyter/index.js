'use strict';
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var httpProxy = require('http-proxy');
var proxy = httpProxy.createProxyServer({});

// Port on which express-app will run (not the notebook app)
const app_port = 8000;

// Common jail directory
const jail_dir = '/home/jail';

// Users directory where all users inside jail will be located
const users_dir = '/home/'; // This folder is a relative path inside jail_dir

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
app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());
app.set('view engine', 'pug');
app.set('views', './views');

// Express routes
app.get('/', function(req, res) {
    // res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    // res.header("Pragma", "no-cache");
    // res.header("Expires", 0);
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
            running: true,
            baseUrl: "http://" + notebook_address + ":" + notebooks[userID].port
        });
    }
    else {
        // Start a new notebook app for the user
        let dir = jail_dir + users_dir + userID;
        if (!fs.existsSync(dir)) {
            // New user
            // Create a workplace for user
            newUser(userID);
        }

        start_notebook(userID, password, function() {
            // Render launch webpage
            res.render('notebook', {
                user: userID,
                running: false,
                baseUrl: 'http://' + notebook_address + ':' + notebooks[userID].port
            });
        });
    }
});

// TODO: Proxy doesn't work
// =============================================================================
app.get('/user/*', function(req, res) {
    console.log("GET: " + req.url);
    let userID = req.url.toString().split('/')[2];
    if (notebooks.hasOwnProperty(userID)) {
        // let url = 'http://' + notebook_address + ':' + notebooks[userID].port + '/user/' + userID + '/notebooks/' + default_notebook;
        proxy.web(req, res, {
            target: 'http://localhost:' + notebooks[userID].port
        });
    }
    else {
        res.send('User not found!');
    }
});

app.post('/user/*', function(req, res) {
    console.log("POST: " + req.url);
    let userID = req.url.toString().split('/')[2];
    if (notebooks.hasOwnProperty(userID)) {
        proxy.web(req, res, {
            target: 'http://localhost:' + notebooks[userID].port
        });
    }
    else {
        res.send('User not found!');
    }
});
// =============================================================================

app.get('/error', function(req, res) {
    res.send('Some error occured\n' + JSON.stringify(req.headers));
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
        '--MultiKernelManager.default_kernel_name=julia-0.5',
        '--NotebookApp.allow_root=False',
        '--NotebookApp.default_url=/notebooks/' + default_notebook,
        '--NotebookApp.port_retries=0',
        '--notebook-dir=' + notebook_dir,
        '--NotebookApp.password=' + password,
        '--NotebookApp.password_required=True',
        // '--NotebookApp.base_url=/',
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
    console.log("Starting notebook...");
    // Setup user notebook process and port
    notebooks[userID] = {process: '', port: ''};

    // Get free port for user
    notebooks[userID].port = getPort();


    // Generate hashed password for user
    genPassword(password, function(err, hashed_password) {
        if (err) {
            console.log("Could not generate user password");
        } else {
            console.log("Password has been generated...");
            // Generate configurations for the customized notebook environment
            let config = getConfig(userID, hashed_password);

            // Launch jupyter notebook
            // notebooks[userID].process = spawn('jupyter', config);
            let cmd = 'jupyter-notebook ' + config.join(' ');
            console.log(cmd);
            notebooks[userID].process = spawn('sudo', ['chroot', '--userspec='+userID, jail_dir, 'bash', '-c', cmd]);
            console.log("Spawning jupyter process...");

            // jupyter notebook logs
            notebooks[userID].process.stdout.on('data', function(data) {
                console.log('' + data);
            });
            notebooks[userID].process.stderr.on('data', function(data) {
                console.error('' + data);
            });

            next();
        }
    });
}

function newUser(userID) {
    exec('sudo bash ./scripts/user.sh ' + userID + ' ' + jail_dir + ' ' + default_notebook_path, function(err, stderr, stdout) {
        if (err) {
            return console.error(err);
        }
        console.log("STDOUT:");
        console.log(stdout + "");
    });
}
