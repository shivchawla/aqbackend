const config = require('config');
var redis = require('redis');
const Promise = require('bluebird');

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

var client = redis.createClient(config.get('redis_port'), config.get('redis_host'));

function getAllFromRedis(masterKey) {
    return client.hgetallAsync(masterKey);
}

function getFromRedis(masterKey, key) {
    return client.hgetAsync(masterKey, key);
}

function insertIntoRedis(masterKey, key, data) {
    return client.hsetAsync(masterKey, key, data);
}

function deleteFromRedis(masterKey, key) {
    return client.hdelAsync(masterKey, key);
}

function getRangeFromRedis(key, fIdx, lIdx) {
    return client.lrangeAsync(key, fIdx, lIdx);
}

function pushToRangeRedis(key, element) {
    return client.lpushAsync(key, element);
}


function popFromRangeRedis(key) {
    return client.rpopAsync(key);
}

function getSetDataFromRedis(key) {
    return client.smembersAsync(key);
}

function setDataExpiry(key, time_in_sec) {
    return client.expireAsync(key, time_in_sec);
}

// For a single key set
function getValue(key) {
    return client.getAsync(key);
}

function insertKeyValue(key, data) {
    client.setAsync(key, data);
}

function deleteKey(key) {
    client.delAsync(key);
}

function incValue(key, increment) {
    client.incrbyAsync(key, increment);
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
    getSetDataFromRedis,
    pushToRangeRedis,
    popFromRangeRedis
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
