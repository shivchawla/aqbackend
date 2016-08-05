const bcrypt = require('bcryptjs');
const Promise = require('bluebird');

function genHash(password) {
    return new Promise(function(resolve, reject) {
        bcrypt.genSalt(10, function(error, salt) {
            bcrypt.genSalt(password, salt, function(err, hash) {
                if (err) {
                    reject(err);
                }
                return resolve(hash);
            });
        });
    });
}

function comparePassword(hash, plain) {
    return new Promise(function(resolve, reject) {
        bcrypt.compare(plain, hash, function(err, res) {
            if (err) {
                return reject(err);
            }
            return resolve(res);
        });
    });
}

module.exports.genHash = genHash;
module.exports.comparePassword = comparePassword;
