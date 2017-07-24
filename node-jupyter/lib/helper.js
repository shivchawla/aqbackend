'use strict';
var globals = require('./globals');
var exec = require('child_process').exec;

exports.getConfig = function (userID, password, dir, port) {
    dir = dir ? dir :  globals.users_dir + userID;
    port = port ? port : globals.notebooks[userID].port;

    return [
        'notebook',
        '--ip=' + globals.notebook_address,
        '--port=' + port,
        '--MultiKernelManager.default_kernel_name=julia-0.5',
        '--NotebookApp.allow_root=False',
        '--NotebookApp.base_url=' + globals.base_url + userID,
        '--NotebookApp.default_url=/notebooks/' + globals.default_notebook,
        '--NotebookApp.port_retries=0',
        '--notebook-dir=' + dir,
        '--NotebookApp.password_required=True',
        '--NotebookApp.password=' + password
        // '--ContentsManager.untitled_directory="Untitled Folder"',
        // '--ContentsManager.untitled_file="untitled"',
        // '--ContentsManager.untitled_notebook="Untitled"'
    ];
};

exports.getPort = function (userID) {
    for(var i=12000;;i++) {
        if (!globals.portlist[i]) {
            globals.portlist[i] = true;
            return i;
        }
    }
}

exports.genPassword = function (password, callback) {
    let command = "/usr/bin/python3 -c 'from notebook.auth import passwd; print(passwd(\"" + password + "\"))'";
    exec(command, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(err, data.substring(0, data.length-1));
        }
    });
}
