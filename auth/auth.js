'use strict';
const UserModel = require('../models/user');
const jwtUtil = require('../utils/jwttoken');

module.exports = function(req, next) {
    const token = req.headers['aimsquant-token'];
    if (token) {
        try {
            jwtUtil.verifyToken(token)
                .then(function(decoded) {
                    if (decoded.exp <= Date.now()) {
                        next('token expired');
                    } else {
                        UserModel.fetchUser({
                            _id: decoded._id
                        }).then(function(user) {
                            req.swagger.params.user = user.toJSON();
                            delete user.password;
                            next();
                        });
                    }
                }).catch(err => {
                    next(err);
                });
        } catch (err) {
            next(err);
        }
    } else {
        next('error');
    }
};
