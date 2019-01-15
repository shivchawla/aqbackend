'use strict';
const UserModel = require('../models/user');
const jwtUtil = require('../utils/jwttoken');
const hashUtil = require('../utils/hashUtil');

//Keep track of number of requests by the user (using REDIS may be)
//And send toekn expired error after let's say 200 API calls
//The dashboard will automatically try to refresh the token if token has expired 
//This prevents the active BOTS using the API incessantly with same token
//NOT PURSUING NOW AS 12/12/2017 [approach still has flaws]

const allowedThirdPaths = [
    '/dailycontest/prediction',
    '/dailycontest/exitPrediction',
    '/dailycontest/portfoliostats',
]

module.exports = function(req, next) {
    const token = req.headers['aimsquant-token'];
    
    jwtUtil.verifyToken(token, {})
    .then(decodedToken=> {
        if(!decodedToken) {
            throw new Error("Token not supplied");
        }
        //BUG FIX: expiry is seconds (and not ms)
        else if (decodedToken.exp*1000 <= Date.now()) {
            throw new Error('Token expired');
        } else {
            return UserModel.fetchUser({_id: decodedToken._id, jwtId: decodedToken.jti}, {fields: 'firstName lastName email'})
        }
    })
    // .then(userDetails => {
    //     if(userDetails) {
    //         req.swagger.params.user = userDetails.toObject();
    .then(user => {
        if(user) {
            const apiPath = req.swagger.apiPath;
            if (checkThirdPartyUser(req.headers)) {
                if (allowedThirdPaths.indexOf(apiPath) === -1) {
                    throw new Error("User not allowed for this operation");
                }
                console.log('Third party user');
            }
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
        next({statusCode: 403, message: err.message});
    });
};

const checkThirdPartyUser = host => {
    const firstPartyHost = 'adviceqube.com';
    return firstPartyHost !== host;
}