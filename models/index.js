const mongoose = require('mongoose');
const Promise = require('bluebird');
Promise.promisifyAll(mongoose);
mongoose.connect('mongodb://aimsquanttesting:qwerty@ds145158.mlab.com:45158/aimsquanttesting');
mongoose.set('debug', true);
// var db = mongoose.connection;
// db.on('error', console.error.bind(console, 'connection error:'));
// db.once('open', function() {
//   console.log('open');
// });
module.exports = mongoose;
