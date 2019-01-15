module.exports.CREATE_PREDICTION = 'createPrediction';
module.exports.UPDATE_PREDICTION = 'updatePrediction';
module.exports.EXIT_PREDICTION = 'exitPrediction';
module.exports.PNL_STATS = 'pnlStats';
module.exports.PORTFOIO_STATS = 'portfolioStats';
module.exports.ALL = 'all';

module.exports.thirdPartyUser = [
    exports.CREATE_PREDICTION,
    exports.UPDATE_PREDICTION,
    exports.EXIT_PREDICTION,
    exports.PNL_STATS,
    exports.PORTFOIO_STATS
];

module.exports.firstPartyUser = [
    exports.ALL
];