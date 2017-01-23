const config = require('config');
const mongoose = require('mongoose');
const Promise = require('bluebird');
Promise.promisifyAll(mongoose);
//mongoose.connect(config.get('mongo_url'));
var opt = {
    user: config.get('mongo_user'),
    pass: config.get('mongo_pass'),
    auth: {
        authdb: 'admin'
    }
};

mongoose.connect(config.get('mongo_path'), 'aimsquant', config.get('mongo_port'), opt);

mongoose.set('debug', true);
// var db = mongoose.connection;
// db.on('error', console.error.bind(console, 'connection error:'));
// db.once('open', function() {
//   console.log('open');
// });
module.exports = mongoose;
