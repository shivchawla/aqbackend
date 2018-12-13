const config = require('config');
var redis = require('redis');
var client = redis.createClient(config.get('redis_port'), config.get('redis_host'));

function getAllFromRedis(masterKey, callback) {
    client.hgetall(masterKey, function(err, data) {
        if (err) {
            callback(err)
        } else {
            callback(err, data);
        }
    });
}

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
    client.hset(masterKey, key, data);
}

function deleteFromRedis(masterKey, key, callback) {
    client.hdel(masterKey, key, function(err, reply) {
        if (err) {
            callback(err);
        } else {
            callback(err, reply);
        }
    });
}

function getRangeFromRedis(key, fIdx, lIdx, callback) {
    client.lrange(key, fIdx, lIdx, function(err, reply) {
        if (err) {
            callback(err);
        } else {
            callback(err, reply);
        }
    });
}

function pushValueInRedisList(key, value, callback) {
    client.rpush(key, value, function(err, reply) {
        if (err) {
            callback(err);
        } else {
            callback(err, reply);
        }
    });
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

module.exports = {
    getFromRedis,
    insertIntoRedis,
    deleteFromRedis,
    setDataExpiry,
    getValue,
    insertKeyValue,
    deleteKey,
    incValue,
    getAllFromRedis,
    getRangeFromRedis,
    pushValueInRedisList
}

/*exports.getFromRedis = getFromRedis;
exports.insertIntoRedis = insertIntoRedis;
exports.deleteFromRedis = deleteFromRedis;
exports.setDataExpiry = setDataExpiry;
exports.getValue = getValue;
exports.insertKeyValue = insertKeyValue;
exports.deleteKey = deleteKey;
exports.incValue = incValue;
exports.getAllFromRedis = getAllFromRedis;
*/
