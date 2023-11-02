const config = require('config');
var redis = require('redis');

async function createClient({port, host, password=""}) {
    client = await redis.createClient({
        socket: {port, host}, 
        ...password!="" && {password}
    })
    .on("error", (error) => console.error(`Error Redis: ${error}`))
    .connect()

    return client
}

function getAllFromRedis(client, masterKey) {
    return client.hGetAll(masterKey);
}

function getFromRedis(client, masterKey, key) {
    return client.hGet(masterKey, key);
}

function insertIntoRedis(client, masterKey, key, data) {
    return client.hSet(masterKey, key, data);
}

function deleteFromRedis(client, masterKey, key) {
    return client.hDel(masterKey, key);
}

function getRangeFromRedis(client, key, fIdx, lIdx) {
    return client.lRange(key, fIdx, lIdx);
}

function pushToRangeRedis(client, key, element) {
    return client.lPush(key, element);
}

function popFromRangeRedis(client, key) {
    return client.rPop(key);
}

function getSetDataFromRedis(client, key) {
    return client.sMembers(key);
}

function addSetDataToRedis(client, key, value) {
    return client.sAdd(key, value);
}

function setDataExpiry(client, key, time_in_sec) {
    return client.expire(key, time_in_sec);
}

function expireKeyInRedis(client, key, dt) {
    return client.expireAt(key, dt);
}

// For a single key set
function getValue(client, key) {
    return client.get(key);
}

function insertKeyValue(client, key, data) {
    return client.set(key, data);
}

function deleteKey(client, key) {
    return client.del(key);
}

function incValue(client, key, increment=1) {
    return client.incrBy(key, increment);
}

function subscribe(client, channel) {
    client.subscribe(channel);    
}

function unsubscribe(client, channel) {
    client.unsubscribe(channel);    
}

function publish(client, channel, message) {
    client.publish(channel, message);
}


module.exports = {
    createClient,
    getFromRedis,
    insertIntoRedis,
    deleteFromRedis,
    setDataExpiry,
    expireKeyInRedis,
    getValue,
    insertKeyValue,
    deleteKey,
    incValue,
    getAllFromRedis,
    getRangeFromRedis,
    getSetDataFromRedis,
    addSetDataToRedis,
    pushToRangeRedis,
    popFromRangeRedis,
    subscribe,
    unsubscribe,
    publish
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
