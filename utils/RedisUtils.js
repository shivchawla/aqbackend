const config = require('config');
var redis = require('redis');
var client = redis.createClient(config.get('redis_port'), config.get('redis_path'));

function getFromRedis(masterKey, key, callback) {
    client.hget(masterKey, key, function (err, data) {

        if (err) {
            callback(err);
        } else {
            callback(err, data);
        }

    });
}

function insertIntoRedis(masterKey, key, data) {
    client.hset(masterKey, key, JSON.stringify(data));
}

function deleteFromRedis(masterKey, key, callback) {
    client.hdel(masterKey, key);
}

function setDataExpiry(key, time_in_sec) {
    client.expire(key, time_in_sec);
}

// For a single key set
function getValue(key, callback) {
    client.get(key, function (err, data) {

        if (err) {
            callback(err);
        } else {
            callback(err, data);
        }

    });
}

function insertKeyValue(key, data) {
    client.set(key, data);
}

function deleteKey(key) {
    client.del(key);
}

function incValue(key, increment) {
    client.incrby(key, increment);
}

exports.getFromRedis = getFromRedis;
exports.insertIntoRedis = insertIntoRedis;
exports.deleteFromRedis = deleteFromRedis;
exports.setDataExpiry = setDataExpiry;
exports.getValue = getValue;
exports.insertKeyValue = insertKeyValue;
exports.deleteKey = deleteKey;
exports.incValue = incValue;