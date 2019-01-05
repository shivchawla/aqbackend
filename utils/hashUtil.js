const bcrypt = require('bcryptjs');
const Promise = require('bluebird');

// genHash('sudhir').then(function(hash) {
//     console.log(hash);
// });

function genHash(password) {
    return new Promise(function(resolve, reject) {
        bcrypt.genSalt(10, function(error, salt) {
            bcrypt.hash(password, salt, function(err, hash) {
                if (err) {
                    return reject(err);
                }
                return resolve(hash);
            });
        });
    });
}

function compareHash(hash, plain) {
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
module.exports.compareHash = compareHash;
