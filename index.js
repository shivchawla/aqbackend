'use strict';
const express = require('express');
const app = require('express')();
var path = require('path');
const swaggerTools = require('swagger-tools');
const jsyaml = require('js-yaml');
const fs = require('fs');
const authMiddleware = require('./auth/auth');
const serverPort = 3002;
const cors = require('cors');
const config = require('config');
const WebSocketServer = require('ws').Server;
const spawn = require('child_process').spawn;


for(var machine of config.get('machines')) {
    var conn = 'ws://' + machine.host + ":" + machine.port;
    console.log("Starting Julia server at " + conn);
    spawn('/Applications/Julia-0.5.app/Contents/Resources/julia/bin/julia', 
                    ["../raftaar/Util/server.jl", machine.port, machine.host]);

}

//var juliaserver = spawn('/Applications/Julia-0.5.app/Contents/Resources/julia/bin/julia', 
  //                  ["../raftaar/Util/server.jl", 2000, "localhost"]);

var server = '';
if(process.env.NODE_ENV === 'development') {
    server = require('http').createServer(app);
} else {
   
    var serverOptions = {
      key: fs.readFileSync(config.get('privkey')),
      cert: fs.readFileSync(config.get('cert'))
    };
    
    server = require('https').createServer(serverOptions, app);
}

const hostname = config.get('hostname');
// swaggerRouter configuration
const options = {
    swaggerUi: '/swagger.json',
    controllers: './controllers',
    useStubs: process.env.NODE_ENV === 'development' ? true : false
        // Conditionally turn on stubs (mock mode)
};

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
const spec = fs.readFileSync('./api/swagger.yaml', 'utf8');
const swaggerDoc = jsyaml.safeLoad(spec);

if (process.env.NODE_ENV === 'staging') {
  swaggerDoc.host = 'service-staging.aimsquant.com' 
}

// Initialize the Swagger middleware
swaggerTools.initializeMiddleware(swaggerDoc, function(middleware) {
    // Interpret Swagger resources and attach metadata to request - must be first
    // in swagger-tools middleware chain
    console.log("inside initialize");
    app.use(middleware.swaggerMetadata());
    app.use(cors());
    // Validate Swagger requests
    app.use(middleware.swaggerValidator());

    // authentication middleware
    app.use(middleware.swaggerSecurity({
        api_key: function(req, authOrSecDef, scopesOrApiKey, cb) {
            authMiddleware(req, cb);
        }
    }));

    // Route validated requests to appropriate controller

    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');

    app.use(middleware.swaggerRouter(options));

    app.use(express.static(path.join(__dirname, 'public')));

    // Serve the Swagger documents and Swagger UI
    app.use(middleware.swaggerUi());

    // load models
    require('./models');

    // set up email service
    //require('./email').config(app);
    // Start the server

    app.use((err, req, res, next) => {
        res.status(400).json(err);
        next(err);
    });

    server.listen(serverPort, function() {
        console.log('Your server is listening on port %d (http://localhost:%d)', serverPort, serverPort);
        console.log('Swagger-ui is available on http://localhost:%d/docs', serverPort);
    });
});
exports.ws = new WebSocketServer({
    server: server,

    // Firefox 7 alpha has a bug that drops the
    // connection on large fragmented messages
    fragmentOutgoingMessages: false
});
// exports.app = app;
