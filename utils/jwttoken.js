const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const moment = require('moment');
const pub = fs.readFileSync(path.join(__dirname, '../', 'pub.pem'));
const priv = fs.readFileSync(path.join(__dirname, '../', 'priv.pem'));

/**
 * payload should be object
 */

function signToken(payload) {
    return new Promise(function(resolve, reject) {
        jwt.sign(payload, priv, {
            issuer: 'aimsquant',
            jwtid: 'jwtid',
            algorithm: 'RS256',
            expiresIn: parseInt(moment().add(24, 'hours').format('x'), 10)
        },
        function(err, token) {
            if (err) {
                return reject(err);
            }
            return resolve(token);
        });
    });
}

function verifyToken(token) {
    return new Promise(function(resolve, reject) {
        jwt.verify(token, pub, function(err, decoded) {
            if (err) {
                return reject(err);
            }
            return resolve(decoded);
        });
    });
}

// signToken({
//     uuid: 'fasdfasd-6c8a-4ce6-b7fd-ebaa7019fc57',
//     role: 1,
//     requests: 1,
//     ttu: 10,
//     ttl: 60
// }).then(function(info) {
//     console.log(info);
//     verifyToken(info).then(function(details) {
//         console.log(details);
//     });
// })

exports.signToken = signToken;
exports.verifyToken = verifyToken;
