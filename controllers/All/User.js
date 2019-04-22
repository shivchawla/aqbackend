'use strict';
const User = require('../Common/UserService');

module.exports.activateUser = function activateUser (req, res, next) {
    User.activateUser(req.swagger.params, res, next);
};

module.exports.resetEmailLink = function activateUser (req, res, next) {
    User.resetEmailLink(req.swagger.params, res, next);
};

module.exports.resetpasswordcall = function activateUser (req, res, next) {
    User.resetPassword(req.swagger.params, res, next);
};
module.exports.registerUser = function registerUser(req, res, next) {
    User.registerUser(req.swagger.params, res, next);
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

module.exports.sendFeedback = function sendFeedback(req, res, next) {
    User.sendFeedback(req.swagger.params, res, next);
};

module.exports.sendInvite = function sendInvite(req, res, next) {
    User.sendInvite(req.swagger.params, res, next);
};

module.exports.updateToken = function updateToken(req, res, next) {
    User.updateToken(req.swagger.params, res, next);
};

module.exports.verifyCaptchaToken = function verifyCaptchaToken(req, res, next) {
    User.verifyCaptchaToken(req.swagger.params, res, next);
};

module.exports.sendInfoEmail = function sendInfoEmail(req, res, next) {
    User.sendInfoEmail(req.swagger.params, res, next);
};

module.exports.sendTemplateEmail = function sendTemplateEmail(req, res, next) {
    User.sendTemplateEmail(req.swagger.params, res, next);
};

module.exports.unsubscribeEmail = function(req, res, next) {
    User.unsubscribeEmail(req.swagger.params, res, next);
};

module.exports.userGoogleLogin = function(req, res, next) {
    User.userGoogleLogin(req.swagger.params, res, next);
}

module.exports.sendJobCompletionEmail = function(req, res, next) {
    User.sendJobCompletionEmail(req.swagger.params, res, next);
}