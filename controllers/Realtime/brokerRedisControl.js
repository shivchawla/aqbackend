/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 13:33:59
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-18 19:22:39
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

module.exports.getValidId = function(increment) {
    let reqId;

    return new Promise((resolve, reject) => {
        RedisUtils.incValue(getRedisClient(), "ValidId", increment)
        .then(validId => {
            reqId = validId;
           
            var reqIds = Array(increment);
            for(var i=0;i<increment;i++) {
                reqIds[i] = validId--; 
            }

            return Promise.mapSeries(reqIds, function(id) {
                return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_SET, id)
                .then(redisOrderInstance => {
                    if (redisOrderInstance) {
                        throw new Error(`ReqId: ${id} in use`);
                    }
                })
            })
            .then(() => {
                resolve(reqId);
            })

        })
        .catch(err => {
            //In case of error, re-launch the requst to fetch Id
            resolve(exports.getValidId(increment));
        })
    });
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
                    brokerStatus: 'PendingSubmit',
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
                        orderActivity: [],
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

module.exports.updateOrderStatus = function(orderId, statusEvent) {
	let predictionId = null;
    let advisorId = null;

	return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_SET, orderId)
    .then(redisOrderInstance => {
        if (!redisOrderInstance) {
            console.log("No prediction info found for order")
            return;
        }
        
        var orderInstance = JSON.parse(redisOrderInstance);

        //Get predictionId/advisorId
        predictionId = _.get(orderInstance, 'predictionId', null);
        advisorId = _.get(orderInstance, 'advisorId', null);

        //Add order activity
        var orderActivityArray = _.get(orderInstance, 'orderActivity', []);
        
        if (orderActivityArray.length > 0) {
            var lastBrokerStatus = _.get(orderActivityArray.slice(-1)[0], 'status', '');
            var latestBrokerStatus = _.get(statusEvent, 'status', '');
            
            if (lastBrokerStatus != latestBrokerStatus) {
                const orderActivity = {
                    date: new Date(),
                    orderId,
                    automated: true,
                    brokerMessage: statusEvent,
                };

                orderActivityArray.push(orderActivity);
                orderInstance.orderActivity = orderActivityArray;
               
                //Add order activity 
                return RedisUtils.insertIntoRedis(
                    getRedisClient(), 
                    ORDER_STATUS_SET,
                    orderId, 
                    JSON.stringify(orderInstance)
                )
            }
        }
        
    })
    .then(() => {
        let predictionStatusKey = `${advisorId}_${predictionId}`;

        if (predictionId && advisorId) {
            return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey)
            .then(redisPredictionInstance => {
                if (redisPredictionInstance) {
                    var predictionInstance = JSON.parse(redisPredictionInstance);

                    const predictionOrders = _.get(predictionInstance, 'orders', []);
                    const orderIdx = _.findIndex(predictionOrders, orderItem => orderItem.orderId === orderId);

                    const status = _.get(statusEvent, 'status', '');

                    if (orderIdx != -1 && status!="") {
                        // const lastBrokerStatus =  predictionInstance.orders[orderIdx].brokerStatus;

                        predictionInstance.orders[orderIdx].brokerStatus = status;

                        if (status == 'Cancelled' || status == "Inactive") {
                            predictionInstance.orders[orderIdx].activeStatus = false;
                        }

                        if (status == 'Filled') {
                             predictionInstance.orders[orderIdx].activeStatus = false;
                             predictionInstance.orders[orderIdx].completeStatus = true;   
                        }

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
                return PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
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

            return RedisUtils.insertIntoRedis(
                getRedisClient(), 
                ORDER_STATUS_SET,
                orderId, 
                JSON.stringify(orderInstance)
            )
            .then(() => {
                if (executionCompleted) {
                    return _saveTradeActivityToDb(advisorId, predictionId, orderId);
                }
            })
            .then(() => {
                RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey);
            });

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
            );

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
		if (redisPredictionInstance) {
            return JSON.parse(redisPredictionInstance);
        } else {
            return null;
        }
    })
};


module.exports.getPredictionActivity = function(advisorId, predictionId) {
    let predictionStatusKey = `${advisorId}_${predictionId}`;

    return RedisUtils.getFromRedis(getRedisClient(), PREDICTION_STATUS_SET, predictionStatusKey)
    .then(redisPredictionInstance => {
        if (redisPredictionInstance) {
            var predictionInstance = JSON.parse(redisPredictionInstance);

            var orderIds = _.get(predictionInstance, 'orders', []).map(item => item.orderId);

            return Promise.map(orderIds, function(orderId) {
                return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_SET, orderId)
                .then(redisOrderInstance => {
                    if (redisOrderInstance){
                        var orderInstance = JSON.parse(redisOrderInstance);

                        var tradeActivity = _.get(orderInstance, 'tradeActivity', []);
                        var orderActivity = _.get(orderInstance, 'orderActivity', []);

                        return {tradeActivity, orderActivity};
                    }
                })
            });

        } else {
            return null;
        }
    })
};


function _saveTradeActivityToDb(orderId) {
    setTimeout(function() {
        return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_SET, orderId)
        .then(redisOrderInstance => {
            if (redisOrderInstance){
                var orderInstance = JSON.parse(redisOrderInstance);

                var advisorId = _.get(orderInstance, 'advisorId', null);
                var predictionId = _.get(orderInstance, 'predictionId', null);

                var tradeActivity = _.get(orderInstance, 'tradeActivity', []);
                var orderActivity = _.get(orderInstance, 'orderActivity', []);

                return Promise.all([
                    DailyContestEntryModel.addOrderActivityForPrediction({advisor: advisorId}, predictionId, orderActivity),
                    DailyContestEntryModel.addTradeActivityForPrediction({advisor: advisorId}, predictionId, tradeActivity)
                ]);
            }
        })
        .then(() => {
            return RedisUtils.deleteFromRedis(getRedisClient, ORDER_STATUS_SET, orderId);
        })
    }, 60000);
}



