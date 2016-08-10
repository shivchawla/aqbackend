'use strict';

const User = require('./UserService');


module.exports.activateUser = function activateUser (req, res, next) {
    User.activateUser(req.swagger.params, res, next);
};

module.exports.regiteruser = function regiteruser(req, res, next) {
    User.regiteruser(req.swagger.params, res, next);
};

module.exports.userlogin = function userlogin(req, res, next) {
    User.userlogin(req.swagger.params, res, next);
};
