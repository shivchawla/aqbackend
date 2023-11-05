const config = require('config');
const mongoose = require('mongoose');

var mongo_host = config.get('mongo_path')
var mongo_port = config.get('mongo_port')
var mongo_db = config.get('mongo_db')
var mongo_user = config.get('mongo_user')
var mongo_pass = config.get('mongo_pass')


var opt = {
    ...mongo_user!="" && {user: mongo_user},
    ...mongo_pass!="" && {pass: mongo_pass},
};

console.log(opt)

mongoose.connect(`mongodb://${mongo_host}:${mongo_port}/${mongo_db}`, opt);

mongoose.set('debug', config.get('mongo_debug'));
module.exports = mongoose;