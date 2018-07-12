'use strict';
const _ = require('lodash');
const Promise = require('bluebird');

const allConfig = require('../../constants');
const APIError = require('../../utils/error');
const config = require('config');

function _getContestConfig(benchmark) {
    
    var config = _.get(allConfig, `benchmarkUniverseRequirements.${benchmark}`, null);
    if (config) {
    	 return config;
    } else {
    	return APIError.throwJsonError({message: `No config for benchmark: ${benchmark}`});
    }  
};

function _getAdviceConfig(user) {
	const userId = user._id;

	//Any one can create an advice
	return AdvisorModel.fetchAdvisor({user:userId}, {fields:'_id', insert: true})
	.then(advisor => {
		if(advisor) {
			return AdviceModel.fetchAdvices({advisor: advisor._d, deleted:false}, {fields:'_id '})
		} else {
			APIError.throwJsonError({message: `No config for user`});
		}
	})
	.then(advices => {
		if(advices.length < config.get('max_advices_per_advisor')) {
			return {numAdvices: advice.length, allowedMax: config.get('max_advices_per_advisor'), goals: allConfig.goals};
		} else {
			return {numAdvices: advice.length, allowedMax: config.get('max_advices_per_advisor'), message: "Advice Limit exceeded"};
		}
	});
}

module.exports.getConfig = function(args, res, next) {
    
    const type = _.get(args, 'type.value', null);
	const benchmark = _.get(args, 'benchmark.value', "NIFTY_50");

    return Promise.resolve(true)
    .then(() => {
    	if (type) {
    		switch(type) {
    			case "contest": return _getContestConfig(benchmark); break;
    			case "advice": return _getAdviceConfig(_.get(args, 'user', null)); break;
    			case "default": APIError.throwJsonError({message: `Type: ${type} not found`}); break;
    		}
    	} else {
    		APIError.throwJsonError({message: "Invalid type; No configuration found"});
    	}
    })
    .then(config => {
    	return res.status(200).send(config);
    })
    .catch(err => {
    	return res.status(400).send(err.message);
    });
};



