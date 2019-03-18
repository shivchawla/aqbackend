/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 13:33:59
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-17 00:30:21
*/

const redis = require('redis');
const config = require('config');
const _ = require('lodash');
const Promise = require('bluebird');

const RedisUtils = require('../../utils/RedisUtils');
const PredictionRealtimeController = require('./predictionControl');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');

let redisClient;

const ORDER_STATUS_SET = "orderStatusSet";
const PREDICTION_STATUS_SET = "predictionStatusSet";

function getRedisClient() {
	if (!redisClient || !redisClient.connected) {
        var redisPwd = config.get('node_redis_pass');

        if (redisPwd !="") {
            redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: redisPwd});
        } else {
            redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'));
        }
    }

    return redisClient; 
}

module.exports.setValidId = function(validId) {
    return RedisUtils.insertKeyValue(getRedisClient(), "ValidId", validId)
}

module.exports.getValidId = function(validId, increment) {
    return RedisUtils.incValue(getRedisClient(), "ValidId", increment);
}

module.exports.addOrdersForPrediction = function(advisorId, predictionId, orderIds, quantity) {
	let predictionStatusKey = `${advisorId}_${predictionId}`;
    return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey)
    .then(redisPredictionInstance => {
        let predictionInstance = redisPredictionInstance ? JSON.parse(redisPredictionInstance) : null;
        
        return Promise.all([
            //P1
            Promise.map(orderIds, function(orderId) {
                const orderInstance = {
                    orderId, // Current orderId after get the next valid order id
                    activeStatus: true,
                    completeStatus: false,
                    brokerStatus: 'PendingSubmit'
                };

                if (predictionInstance) {
                    predictionInstance.orders.push(orderInstance);
                } else {
                    predictionInstance = {accumulated: 0, orders: [orderInstance]};
                }

            })
            .then(() => {
                return RedisUtils.insertIntoRedis(
                    getRedisClient(), 
                    PREDICTION_STATUS_SET, 
                    predictionStatusKey,
                    JSON.stringify(predictionInstance)
                ) 
            }),

            //P2
            Promise.map(orderIds, function(orderId) {
                // Storing in the orderForPredictions dictionary in Redis
                return RedisUtils.insertIntoRedis(
                    getRedisClient(), 
                    ORDER_STATUS_SET, 
                    orderId, 
                    JSON.stringify({
                        advisorId,
                        predictionId, 
                        tradeActivity: [],
                        orderedQuantity: quantity
                    })
                );
            })
        ]);
        
    })
    .then(() => {
    	if (advisorId && predictionId) {
        	PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
    	}
    })    
};

module.exports.updateOrderStatus = function(orderId, status) {
	let predictionId = null;
    let advisorId = null;

	return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_SET, orderId)
    .then(redisOrderInstance => {
        if (!redisOrderInstance) {
            console.log("No prediction info found for order")
            return;
        }
        var orderInstance = JSON.parse(redisOrderInstance);
        
        predictionId = _.get(orderInstance, 'predictionId', null);
        advisorId = _.get(orderInstance, 'advisorId', null);

        let predictionStatusKey = `${advisorId}_${predictionId}`;

        if (predictionId && advisorId) {
            return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey)
            .then(redisPredictionInstance => {
                if (redisPredictionInstance) {
                    var predictionInstance = JSON.parse(redisPredictionInstance);

                    const predictionOrders = _.get(predictionInstance, 'orders', []);
                    const orderIdx = _.findIndex(predictionOrders, orderItem => orderItem.orderId === orderId);

                    if (orderIdx != -1) {
                        predictionInstance.orders[orderIdx].brokerStatus = status;

                        //Update the broker status on order status message;
                        return RedisUtils.insertIntoRedis(
                            getRedisClient(), 
                            PREDICTION_STATUS_SET,
                            predictionStatusKey, 
                            JSON.stringify(predictionInstance)
                        );
                    }
                }
            })
            .then(() => {
                if (advisorId && predictionId) {
                    return PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
                }
            })
        }
    });
};

module.exports.updateOrderExecution = function(orderId, execution) {
    console.log('Execution ', execution);
	let predictionId = null;
    let advisorId = null;
    let executionCompleted = false;

    const executionId = _.get(execution, 'execId', null);
    const cumulativeQuantity = _.get(execution, 'cumQty', 0);
    const direction = _.get(execution, "side", "BOT") == "BOT" ? 1 : -1
    const fillQuantity = _.get(execution, 'shares', 0) * direction;
    const avgPrice = _.get(execution, 'avgFillPrice', 0.0);

    const tradeActivity = {
        date: new Date(), 
        direction: direction == 1 ? "BUY" : "SELL",
        quantity: fillQuantity,
        price: avgPrice,
        automated: true
    };
            
    RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_SET, orderId)
    .then(redisOrderInstance => {
        if (!redisOrderInstance) {
            console.log("No prediction info found for order")
            return;
        }

        console.log('------------Required Order Instance--------------', redisOrderInstance);
        var orderInstance = JSON.parse(redisOrderInstance);
        
        predictionId = _.get(orderInstance, 'predictionId', null);
        advisorId = _.get(orderInstance, 'advisorId', null);

        let predictionStatusKey = `${advisorId}_${predictionId}`;
        
        var orderedQuantity = _.get(orderInstance, 'orderedQuantity', 0)

        //Update "is execution is COMPLETE" flag
        executionCompleted = orderedQuantity == cumulativeQuantity

        // tradeActivity for the particular order instance
        // we check if the execution id already exists in the trade Activity Array
        var tradeActivityArray = _.get(orderInstance, 'tradeActivity', []);
        const isExecutionIdPresent = _.findIndex(tradeActivityArray, tradeActivityItem => tradeActivityItem.brokerMessage.execId === executionId) > -1;

        if (!isExecutionIdPresent) {
        	tradeActivity = {...tradeActivity, brokerMessage: execution};
            tradeActivityArray.push(tradeActivity);
            orderInstance.tradeActivity = tradeActivityArray

            Promise.all([
            	//P1 (Save trade Activity to DB)
            	DailyContestEntryModel.addTradeActivityForPrediction({advisor: advisorId}, predictionId, tradeActivity),
            	
            	//P2
            	Promise.resolve()
            	.then(() => {
	                if (!executionCompleted) {
	                    return RedisUtils.insertIntoRedis(
	                        getRedisClient(), 
	                        ORDER_STATUS_SET,
	                        orderId, 
	                        JSON.stringify(orderInstance)
	                    );

	                } else {
                    	RedisUtils.deleteFromRedis(getRedisClient(), ORDER_STATUS_SET, orderId);
	                }
	            })
            ])
            .then(() => {
                return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey);
            })

        } else {
            return null;
        }
    })
    .then(redisPredictionInstance => {
        if (redisPredictionInstance) {
            var predictionInstance = JSON.parse(redisPredictionInstance);
            const predictionOrders = _.get(predictionInstance, 'orders', []);
            const orderIndex = _.findIndex(predictionOrders, orderItem => orderItem.orderId === orderId);

            const accumulatedQuantity = _.get(predictionInstance, 'accumulated', 0);
            //Update the accumulated quantity
            predictionInstance.accumulated = accumulatedQuantity + fillQuantity

            //Updating the ative/complete status for required prediction
            if (executionCompleted && orderIndex > -1) {
                predictionOrders[orderIndex] = {
                    ...predictionOrders[orderIndex],
                    activeStatus: false,
                    completeStatus: true
                };

                predictionInstance.orders = predictionOrders;
            }

            return RedisUtils.insertIntoRedis(
                        getRedisClient(), 
                        PREDICTION_STATUS_SET,
                        predictionStatusKey, 
                        JSON.stringify(predictionInstance)
                    )

        } else {
            return null;
        }
    })
    .then(() => {
        if(advisorId && predictionId) {
            PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
        }
    });
};

module.exports.getPredictionStatus = function(advisorId, predictionId) {
    console.log("AdvisoId", advisorId);
    console.log("Prediciton", predictionId);
    
	let predictionStatusKey = `${advisorId}_${predictionId}`;

	return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey)
	.then(redisPredictionInstance => {
		if (redisPredictionInstance) {
            console.log(redisPredictionInstance);
            return JSON.parse(redisPredictionInstance);
        } else {
            return null;
        }
    })
};




