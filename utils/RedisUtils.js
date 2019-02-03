const config = require('config');
var redis = require('redis');
const Promise = require('bluebird');

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

function getAllFromRedis(client, masterKey) {
    return client.hgetallAsync(masterKey);
}

function getFromRedis(client, masterKey, key) {
    return client.hgetAsync(masterKey, key);
}

function insertIntoRedis(client, masterKey, key, data) {
    return client.hsetAsync(masterKey, key, data);
}

function deleteFromRedis(client, masterKey, key) {
    return client.hdelAsync(masterKey, key);
}

function getRangeFromRedis(client, key, fIdx, lIdx) {
    return client.lrangeAsync(key, fIdx, lIdx);
}

function pushToRangeRedis(client, key, element) {
    return client.lpushAsync(key, element);
}

function popFromRangeRedis(client, key) {
    return client.rpopAsync(key);
}

function getSetDataFromRedis(client, key) {
    return client.smembersAsync(key);
}

function setDataExpiry(client, key, time_in_sec) {
    return client.expire(key, time_in_sec);
}

// For a single key set
function getValue(client, key) {
    return client.getAsync(key);
}

function insertKeyValue(client, key, data) {
    client.setAsync(key, data);
}

function deleteKey(client, key) {
    client.delAsync(key);
}

function incValue(client, key, increment) {
    client.incrbyAsync(key, increment);
}

function subscribe(client, channel) {
    return client.subscribe(channel);    
}

function unsubscribe(client, channel) {
    return client.unsubscribe(channel);    
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
    popFromRangeRedis,
    subscribe,
    unsubscribe
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
