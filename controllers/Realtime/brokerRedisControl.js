/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 13:33:59
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-16 15:45:45
*/

const redis = require('redis');
const config = require('config');

const RedisUtils = require('../../utils/RedisUtils');
const PredictionRealtimeController = require('./predictionControl');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');

let redisClient;

const ORDER_STATUS_SET = "orderStatusSet";
const PREDICTION_STATUS_SET = "predictionStatusSet";

function getRedisClient() {
	if (!redisClient || !redisClient.connected) {
        redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: config.get('node_redis_pass')});
    }

    return redisClient; 
}

module.exports.addOrdersForPrediction = function(advisorId, predictionId, orderIds) {
	let predictionStatusKey = `${predictionId}_${advisorId}`;
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
                RedisUtils.insertIntoRedis(
                    getRedisClient(), 
                    PREDICTION_STATUS_SET, 
                    predictionStatusKey,
                    predictionInstance
                ) 
            }),

            //P2
            Promise.map(orderIds, function(orderId) {
                // Storing in the orderForPredictions dictionary in Redis
                RedisUtils.insertIntoRedis(
                    getRedisClient(), 
                    ORDER_STATUS_SET, 
                    orderId, 
                    JSON.stringify({
                        advisorId,
                        predictionId, 
                        executionDetail: [],
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
	let predictionId = null;
    let advisorId = null;
    let executionCompleted = false

    const executionId = _.get(execution, 'execId', null);
    const cumulativeQuantity = _.get(execution, 'cumQty', 0);
    const direction = _.get(execution, "side", "BOT") == "BOT" ? 1 : -1
    const fillQuantity = _.get(execution, 'shares', 0) * direction;

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

        // execution detail for the particular order instance
        // we check if the execution id already exists in the execution detail array
        var executionDetailArray = _.get(orderInstance, 'executionDetail', []);
        const isExecutionIdPresent = _.findIndex(executionDetailArray, executionDetailItem => executionDetailItem.execId === executionId) > -1;

        if (!isExecutionIdPresent) {
            executionDetailArray.push(execution);
            orderInstance.executionDetail = executionDetailArray;

            return Promise.resolve()
            .then(() => {
                //Save to redis if execution is incomplete otherwise to DB
                if (!executionCompleted) {
            
                    return RedisUtils.insertIntoRedis(
                        getRedisClient(), 
                        ORDER_STATUS_SET,
                        orderId, 
                        JSON.stringify(orderInstance)
                    );

                } else {
                	//Add complete execution details for the order to the DB and delete from Redis
                    DailyContestEntryModel.addExecutionDetailToPrediction({advisor: advisorId}, predictionId, executionDetail)
                    .then(added => {
                    	RedisUtils.deleteFromRedis(getRedisClient(), ORDER_STATUS_SET, orderId);
                    })
                }
            })
            .then(executionDetailUpdated => {
                return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey);
            })

        } else {
            return null;
        }
    })
    .then(redisPredictionInstance => {
        if (redisPredictionInstance !== null) {
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
	let predictionStatusKey = `${advisorId}_${predictionId}`;

	return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey)
	.then(redisPredictionInstance => {
		if (redisPredictionInstance !== null) {
            return JSON.parse(redisPredictionInstance);
        } else {
            return null;
        }
    })
};



