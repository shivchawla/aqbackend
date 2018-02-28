/*
* @Author: Shiv Chawla
* @Date:   2018-01-11 10:44:54
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2018-02-28 10:51:29
*/
'use strict';
const Notebook = require('../Research/NotebookService');

module.exports.createNotebook = function(req, res, next) {
    Notebook.createNotebook(req.swagger.params, res, next);
};

module.exports.getNotebook = function(req, res, next) {
    Notebook.getNotebook(req.swagger.params, res, next);
};

module.exports.getNotebooks = function(req, res, next) {
    Notebook.getNotebooks(req.swagger.params, res, next);
};