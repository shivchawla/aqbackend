'use strict';
const express = require('express');
const app = require('express')();
var path = require('path');
const swaggerTools = require('swagger-tools');
const jsyaml = require('js-yaml');
const fs = require('fs');
const authMiddleware = require('./auth/auth');
const serverPort = parseInt(process.argv[2]) || 3002;
const cors = require('cors');
const config = require('config');
const WebSocketServer = require('ws').Server;
const spawn = require('child_process').spawn;

exports.serverPort = serverPort;
var server = '';
if(process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging') {
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
  swaggerDoc.host = 'stagingapi.aimsquant.com'
}

// Initialize the Swagger middleware
swaggerTools.initializeMiddleware(swaggerDoc, function(middleware) {
    // Interpret Swagger resources and attach metadata to request - must be first
    // in swagger-tools middleware chain

    app.use(middleware.swaggerMetadata());
    app.use(cors());
    // Validate Swagger requests
    app.use(middleware.swaggerValidator());

    // authentication middleware
    app.use(middleware.swaggerSecurity({
        api_key: function(req, authOrSecDef, scopesOrApiKey, cb) {
            return authMiddleware(req, cb);
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
        var statusCode = err.statusCode ? err.statusCode : 400;
        return res.status(statusCode).json(err);
        next(err);
    });

    return server.listen(serverPort, function() {
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
