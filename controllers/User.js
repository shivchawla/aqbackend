'use strict';

var url = require('url');


var User = require('./UserService');


module.exports.logoutUser = function logoutUser (req, res, next) {
  User.logoutUser(req.swagger.params, res, next);
};

module.exports.regiteruser = function regiteruser (req, res, next) {
  User.regiteruser(req.swagger.params, res, next);
};

module.exports.userlogin = function userlogin (req, res, next) {
  User.userlogin(req.swagger.params, res, next);
};
