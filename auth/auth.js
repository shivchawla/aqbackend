'use strict';
const UserModel = require('../models/user');
const jwtUtil = require('../utils/jwttoken');

module.exports = function(req, next) {
    const token = req.headers['aimsquant-token'];
    if (token) {
        try {
            jwtUtil.verifyToken(token, {})
            .then(decoded => {
                //BUG FIX: expiry is seconds (and not ms)
                if (decoded.exp*1000 <= Date.now()) {
                    next('token expired');
                } else {

                    UserModel.fetchUser({
                        _id: decoded._id
                    }).then(user => {
                        if(user) {
                            req.swagger.params.user = user.toJSON();
                            delete user.password;
                            next();
                        } else {
                            next("Invalid User");
                        }
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
