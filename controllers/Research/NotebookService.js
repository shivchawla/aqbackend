/*
* @Author: Shiv Chawla
* @Date:   2018-01-11 10:45:49
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-01-27 11:57:43
*/
'use strict';
const UserModel = require('../../models/user');
const config = require('config');
var fs = require('fs');
var path = require("path");
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
 
// Port on which express-app will run (not the notebook app)
const app_port = 8000;

// Users directory where all users inside jail will be located
const users_dir = '/Users/shivkumarchawla/notebooks/';

// Default notebook for the user
const default_notebook = 'Getting-Started.ipynb';

// Path for the default notebook
const default_notebook_path = './Getting-Started.ipynb';

// Address and port where notebooks will run
const notebook_address = '127.0.0.1';
const notebook_starting_port = 12000;

// List all running notebooks
var notebooks = {};

// Ports occupied by the running notebooks
var portlist = {};

exports.createNotebook = function(args, res, next) {
    const userId = args.user._id;

	if (notebooks.hasOwnProperty(userId)) {
        // Users notebook is already running
        res.render('notebook', {
            user: userId,
            baseUrl: 'http://localhost:' + notebooks[userId].port + '/user/' + userId + '/'
        });
    }
    else {
        // Setup notebook
        let dir = users_dir + userId;
        let start = function(userId, password) {
            start_notebook(userId, password, function(err) {
                if (err) {
                    res.send('Error occured: ' + err);
                }
                else {
                    // Render launch webpage
                    res.render('notebook', {
                        user: userId,
                        running: false,
                        baseUrl: 'http://localhost:' + notebooks[userId].port + '/user/' + userId + '/'
                    });
                }
            });
        };


        if (!fs.existsSync(dir)) {
            // New user
            // Create a workplace for user
            newUser(userId, start);
        }
        else {
            // Start the notebook app
            start(userId);
        }
    }
};

// Helper functions

var getConfig = function(userId, port, notebook_dir) {
    port = port ? port : notebooks[userId].port;
    notebook_dir = notebook_dir ? notebook_dir :  users_dir + userId;

    return [
        '--ip=' + notebook_address,
        '--port=' + port,
        '--NotebookApp.allow_root=False',
        '--NotebookApp.default_url=/notebooks/' + default_notebook,
        '--NotebookApp.port_retries=0',
        '--notebook-dir=' + notebook_dir,
        //'--NotebookApp.password=' + password,
        //'--NotebookApp.password_required=True',
        '--MultiKernelManager.default_kernel_name=julia-0.6',
        '--NotebookApp.base_url=/user/' + userId,
        // '--ContentsManager.untitled_directory="Untitled Folder"',
        // '--ContentsManager.untitled_file="untitled"',
        // '--ContentsManager.untitled_notebook="Untitled"',
        '--no-browser'
    ];
};

function getPort(userId) {
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

function start_notebook(userId, next) {
    // Setup user notebook process and port
    notebooks[userId] = {process: '', port: ''};

    // Get free port for user
    notebooks[userId].port = getPort();

    // Generate hashed password for user
    /*genPassword(password, function(err, hashed_password) {
        if (err) {
            console.log("Could not generate user password");
        } else {*/
        
        // Generate configurations for the customized notebook environment
        let config = getConfig(userId);

        // Launch jupyter notebook
        let cmd = 'jupyter-notebook ' + config.join(' ');
        // notebooks[userId].process = spawn('su', [userId, "\"" + cmd + "\""], {shell: true});
        // notebooks[userId].process = spawn('jupyter-notebook', config, {uid: 1002});
        /*notebooks[userId].process = exec("sudo -H -u " + userId + " bash -c '" + cmd + "'", function(err, stdout, stderr) {
            if (err) {
                return console.error(stderr);
            }
        });*/
        
        //notebooks[userId].process = exec("sudo -H -u " + userId + " bash -c '" + cmd + "'");
        notebooks[userId].process = exec(`bash -c ${cmd}`);

        // jupyter notebook logs
        notebooks[userId].process.stdout.on('data', function(data) {
            console.log('' + data);
        });
        
        notebooks[userId].process.stderr.on('data', function(data) {
            console.error('' + data);
        });
       
}

function newUser(userId, next) {
	var scriptFile = path.resolve(path.join(__dirname, './scripts/addUser.sh'));
	console.log(scriptFile);
    exec(`bash ${scriptFile} ` + userId, function(err, stdout, stderr) {
        if (err) {
            return console.error(err);
        }
        
        console.log("ADD_USER: " + stderr);
        next(userId);
    });
}
    
