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

module.exports.forgotPassword = function forgotPassword (req, res, next) {
    User.forgotPassword(req.swagger.params, res, next);
};

module.exports.resetPassword = function resetPassword (req, res, next) {
    User.resetPassword(req.swagger.params, res, next);
};

module.exports.getProfile = function getProfile(req, res, next) {
    User.getProfile(req.swagger.params, res, next);
};
