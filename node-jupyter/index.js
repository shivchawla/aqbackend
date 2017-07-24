'use strict';
var server = require('./lib/express-config.js');
var globals = require('./lib/globals');

server.listen(globals.port, function() {
	console.log("Listening on port " + globals.port + "...");
});
