'use strict';
const UserModel = require('../models/user');
const jwtUtil = require('../utils/jwttoken');

//Keep track of number of requests by the user (using REDIS may be)
//And send toekn expired error after let's say 200 API calls
//The dashboard will automatically try to refresh the token if token has expired 
//This prevents the active BOTS using the API incessantly with same token
//NOT PURSUING NOW AS 12/12/2017 [approach still has flaws]

module.exports = function(req, next) {
    const token = req.headers['aimsquant-token'];
    
    jwtUtil.verifyToken(token, {})
    .then(decoded => {
        if(!decoded) {
            throw new Error("Token not supplied");
        }
        //BUG FIX: expiry is seconds (and not ms)
        else if (decoded.exp*1000 <= Date.now()) {
            throw new Error('Token expired');
        } else {
            return UserModel.fetchUser({_id: decoded._id});
        }
    })
    .then(user => {
        if(user) {
            delete user.password;
            delete user.code;
            req.swagger.params.user = user.toJSON();
            next();
            return null;
        } else {
            throw new Error("Invalid User");
        }
    })
    .catch(err => {
        console.log(err);
        next(err);
    });
};
