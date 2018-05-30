'use strict';
const _ = require('lodash');
const Goals = require('../../constants');

module.exports.getConfig = function(args, res, next) {
    const advice = _.get(args, 'advice.value', 0);
    let response = {};
    if (advice === 1) {
        response = Goals;
    }
    res.status(200).send(response);
}