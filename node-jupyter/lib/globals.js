'use strict';
const port = 8000;
const users_dir = '/home/kishlaya/users/';
const default_notebook = 'Getting-Started.ipynb';
const notebook_address = '127.0.0.1';
const base_url = '/user/';

var notebooks = {};
var portlist = {};

exports.port = port;
exports.users_dir = users_dir;
exports.default_notebook = default_notebook;
exports.notebook_address = notebook_address;
exports.base_url = base_url;
exports.notebooks = notebooks;
exports.portlist = portlist;
