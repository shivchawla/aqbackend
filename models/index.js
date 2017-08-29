const config = require('config');
const mongoose = require('mongoose');
const Promise = require('bluebird');
Promise.promisifyAll(mongoose);

var opt = {
    user: config.get('mongo_user'),
    pass: config.get('mongo_pass'),
};

var mongo_host = config.get('mongo_path')
var mongo_port = config.get('mongo_port')
var mongo_db = config.get('mongo_db')
var mongo_user = config.get('mongo_user')
var mongo_pass = config.get('mongo_pass')

mongoose.connect(`mongodb://${mongo_user}:${mongo_pass}@${mongo_host}:${mongo_port}/${mongo_db}?authSource=admin`);
//mongoose.connect(config.get('mongo_path'), config.get('mongo_db'), config.get('mongo_port'), opt);

mongoose.set('debug', config.get('mongo_debug'));
module.exports = mongoose;