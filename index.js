'use strict';

const app = require('express')();
const swaggerTools = require('swagger-tools');
const jsyaml = require('js-yaml');
const fs = require('fs');
const authMiddleware = require('./auth/auth');
const serverPort = 3002;
const cors = require('cors');
const WebSocket = require('ws').Server;
const server = require('http').createServer(app);
// swaggerRouter configuration
const options = {
    swaggerUi: '/swagger.json',
    controllers: './controllers',
    useStubs: process.env.NODE_ENV === 'development' ? true : false
        // Conditionally turn on stubs (mock mode)
};
let ws;

// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
const spec = fs.readFileSync('./api/swagger.yaml', 'utf8');
const swaggerDoc = jsyaml.safeLoad(spec);

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
            authMiddleware(req, cb);
        }
    }));

    // Route validated requests to appropriate controller
    app.use(middleware.swaggerRouter(options));

    // Serve the Swagger documents and Swagger UI
    app.use(middleware.swaggerUi());

    // load models
    require('./models');

    // set up email service
    require('./email').config(app);
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
exports.ws = new WebSocket({
    server: server,

    // Firefox 7 alpha has a bug that drops the
    // connection on large fragmented messages
    fragmentOutgoingMessages: false
});
// exports.app = app;
