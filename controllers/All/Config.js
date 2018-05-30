'use strict';

const Config = require('../Marketplace/ConfigService');

module.exports.getConfig = function(req, res, next) {
    Config.getConfig(req.swagger.params, res, next);
}