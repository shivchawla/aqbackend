/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 13:33:59
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-03-19 14:54:50
*/

const redis = require('redis');
const config = require('config');
const _ = require('lodash');
const Promise = require('bluebird');
const schedule = require('node-schedule');

schedule.scheduleJob("*/1 * * * *", function() {
    _processIBEvents();
});

const RedisUtils = require('../../utils/RedisUtils');
const PredictionRealtimeController = require('./predictionControl');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');

let redisClient;

const ORDER_EXECUTION_DETAILS_SET = "orderExecutionDetailSet";
const ORDER_STATUS_BY_PREDICTION_SET = "orderStatusByPredictionSet";

const IB_EVENTS = "interactiveBrokerEvents";

let EVENT_PROCESS_FLAG = false;

//Temporary hash to send order submitted from the program (may or may not hit IB servers)
const TEMP_ORDER_TO_PREDICTION_SET = "orderToPredictionSet";

function getRedisClient() {
	if (!redisClient || !redisClient.connected) {
        var redisPwd = config.get('node_redis_pass');

        if (redisPwd != "") {
            redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: redisPwd});
        } else {
            redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'));
        }
    }

    return redisClient; 
}

module.exports.setValidId = function(validId) {
    return RedisUtils.insertKeyValue(getRedisClient(), "ValidId", validId)
};

module.exports.getValidId = function(increment=1) {
    let reqId;

    return new Promise((resolve, reject) => {
        RedisUtils.incValue(getRedisClient(), "ValidId", increment)
        .then(validId => {
            reqId = validId;

            // console.log("After increment:", validId);
           
            var reqIds = Array(increment);
            for(var i=0;i<increment;i++) {
                reqIds[i] = validId--; 
            }

            // console.log(reqIds);

            return Promise.mapSeries(reqIds, function(id) {
                return RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, id)
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
};

//Add orderId to predictionId/AdvisorId in redis store (use this to handle open order event)
//This is required in-case order was never transmitted to the IB and to prevent setting default order instance
//Now order instance is only set on OPENORDER EVENT
//We will write a logic to delete this key/value after 5 seconds
module.exports.addOrdersForPrediction = function(advisorId, predictionId, orderIds) {
    return Promise.map(orderIds, function(orderId) {
        return RedisUtils.insertIntoRedis(
            getRedisClient(),
            TEMP_ORDER_TO_PREDICTION_SET,
            orderId,
            JSON.stringify({advisorId, predictionId})
        );
    });    
};

module.exports.addInteractiveBrokerEvent = function(eventDetails, eventType) {
    return RedisUtils.pushToRangeRedis(getRedisClient(), IB_EVENTS, JSON.stringify({eventType, eventDetails}))
    .then(() => {
        _processIBEvents();
    })
};

function _processIBEvents() {
    
    let ibEvent;
    return  Promise.resolve()
    .then(() => {
        if (!EVENT_PROCESS_FLAG) {
            EVENT_PROCESS_FLAG = true;
            return RedisUtils.popFromRangeRedis(getRedisClient(), IB_EVENTS)
        } else {
            throw new Error("IB events are already under process");
        }
    })
    .then(redisIBEvent => {
        if (redisIBEvent) {
           
            try { 
                ibEvent = JSON.parse(redisIBEvent);

                var eventType = _.get(ibEvent, 'eventType', '');
                if(eventType == '') {
                    throw new Error("Invalid eventType");
                }

                var eventDetails = _.get(ibEvent, 'eventDetails', {});

                const orderId = _.get(eventDetails, 'orderId', null);
                console.log(`About to process: ${eventType} for ${orderId}`);

                if (eventType == 'orderStatus') {
                    return _processOrderStatusEvent(eventDetails);
                } else if (eventType == 'openOrder') {
                    return _processOpenOrderEvent(eventDetails);
                } else if (eventType == 'execDetails') {
                    return _processOrderExecutionEvent(eventDetails);
                } else {
                    throw new Error(`Invalid event type; ${eventType}`);
                }
            } catch(err) {
                
                EVENT_PROCESS_FLAG = false;
                if (ibEvent) {
                    //Add back the event to event List
                    console.log("Error processing event: Adding the event back to the list");
                    return RedisUtils.pushToRangeRedis(getRedisClient(), IB_EVENTS, JSON.stringify(ibEvent));
                }
            }
        } else {
            EVENT_PROCESS_FLAG = false;
            throw new Error("Nothing to process");
        }
    })
    .then(() => {
        //Re-process after ending
        EVENT_PROCESS_FLAG = false;
        return _processIBEvents();
    })
    .catch(err => {
        console.log(err.message);
    });
}

function _processOpenOrderEvent(openOrderDetails) {
	
    let advisorId = null;
    let predictionId = null;
    let quantity;
    let status;
    let ordersBypredictionStatusKey;

    const  orderId = _.get(openOrderDetails, 'orderId', null);

    return Promise.resolve()
    .then(() => {
        if (orderId) {
            return RedisUtils.getFromRedis(getRedisClient(), TEMP_ORDER_TO_PREDICTION_SET, orderId)        
        } else {
            throw new Error("Error while processiing open order: Invalid OrderId");
        }
    })
    .then(redisOrderToPredictionKey => {
        if (redisOrderToPredictionKey) {
            var orderToPredictionKey = JSON.parse(redisOrderToPredictionKey);

            //Get Advisor and Prediction from the redis dictionary
            advisorId = _.get(orderToPredictionKey, 'advisorId', null);
            predictionId = _.get(orderToPredictionKey, 'predictionId', null);

            ordersBypredictionStatusKey = `${advisorId}_${predictionId}`;

            quantity = _.get(openOrderDetails, 'order.totalQuantity', 0);
            status = _.get(openOrderDetails, 'orderState.status', '');
            var warningText = _.get(openOrderDetails, 'orderState.warningText', '');

            if (quantity == 0) {
                throw new Error("Order has ZERO quantity");
            }

            if (status == '') {
                throw new Error("Order has INVALID status");
            }

            if (warningText != '') {
                throw new Error(warningText);
            }

            const orderActivity = {
                date: new Date(),
                orderId,
                automated: true,
                status,
                brokerMessage: openOrderDetails,
                activityType: 'openOrder'
            };

            return RedisUtils.insertIntoRedis(
                getRedisClient(), 
                ORDER_EXECUTION_DETAILS_SET,
                orderId, 
                JSON.stringify({
                    advisorId,
                    predictionId, 
                    tradeActivity: [],
                    orderActivity: [orderActivity],
                    orderedQuantity: quantity
                })
            )
            .then(() => {
                return RedisUtils.getFromRedis(
                    getRedisClient(), 
                    ORDER_STATUS_BY_PREDICTION_SET,
                    ordersBypredictionStatusKey
                );
            })
        }
    })
    .then(redisOrderStatusByPrediction => {
        let orderStatusByPrediction;
        
        const openOrderInstance = {
            orderId, // Current orderId after get the next valid order id
            activeStatus: true,
            completeStatus: false,
            brokerStatus: status,
            accQuantity: 0,
            totalQuantity: quantity,
        };

        if (redisOrderStatusByPrediction) {
            orderStatusByPrediction = JSON.parse(redisOrderStatusByPrediction);

            // console.log("Adding order to list of orders for prediction");
            orderStatusByPrediction.orders.push(openOrderInstance);
        } else {
            orderStatusByPrediction = {accumulated:0, orders: [openOrderInstance]};   
        }

        return RedisUtils.insertIntoRedis(
            getRedisClient(), 
            ORDER_STATUS_BY_PREDICTION_SET,
            ordersBypredictionStatusKey,
            JSON.stringify(orderStatusByPrediction)
        );

    })
    .then(() => {
    	if (advisorId && predictionId) {
        	return PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
    	}
    }) 
    .catch(err => {
        console.log(`Open order error - ${err.message}`);
    })   
};

function _processOrderStatusEvent(orderStatusDetails) {
	let predictionId = null;
    let advisorId = null;

    let status;

    const orderId = _.get(orderStatusDetails, 'orderId', null);

	return RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId)
    .then(redisOrderExecutionDetailsInstance => {
        if (!redisOrderExecutionDetailsInstance) {
            console.log(`No prediction info found for order: ${orderId}`);
            return;
        }
        
        var orderExecutionDetailsInstance = JSON.parse(redisOrderExecutionDetailsInstance);

        //Get predictionId/advisorId
        predictionId = _.get(orderExecutionDetailsInstance, 'predictionId', null);
        advisorId = _.get(orderExecutionDetailsInstance, 'advisorId', null);

        status = _.get(orderStatusDetails, 'status', '');

        const orderActivity = {
            date: new Date(),
            orderId,
            automated: true,
            status,
            brokerMessage: orderStatusDetails,
            activityType: 'orderStatus'
        };

        //Add order activity
        var orderActivityArray = _.get(orderExecutionDetailsInstance, 'orderActivity', []);
        
        let lastBrokerStatus        
        if (orderActivityArray.length > 0) {
            lastBrokerStatus = _.get(orderActivityArray.slice(-1)[0], 'status', '');
        }

        if (lastBrokerStatus != status || orderActivityArray.length == 0) {
            
            orderActivityArray.push(orderActivity);
            orderExecutionDetailsInstance.orderActivity = orderActivityArray;
           
            //Add order activity 
            return RedisUtils.insertIntoRedis(
                getRedisClient(), 
                ORDER_EXECUTION_DETAILS_SET,
                orderId, 
                JSON.stringify(orderExecutionDetailsInstance)
            )
        }

    })
    .then(() => {
        let orderStatusByPredictionKey = `${advisorId}_${predictionId}`;

        if (predictionId && advisorId) {
            return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_BY_PREDICTION_SET, orderStatusByPredictionKey)
            .then(redisOrderStatusByPrediction => {
                if (redisOrderStatusByPrediction) {
                    var orderStatusByPrediction = JSON.parse(redisOrderStatusByPrediction);

                    const predictionOrders = _.get(orderStatusByPrediction, 'orders', []);
                    const orderIdx = _.findIndex(predictionOrders, orderItem => orderItem.orderId === orderId);

                    if (orderIdx != -1 && status!="") {
                        
                        // console.log(`Updating order status for orders: ${status}`);
                        orderStatusByPrediction.orders[orderIdx].brokerStatus = status;

                        if (status == 'Cancelled' || status == "Inactive") {
                            orderStatusByPrediction.orders[orderIdx].activeStatus = false;
                        }

                        if (status == 'Filled') {
                             orderStatusByPrediction.orders[orderIdx].activeStatus = false;
                             orderStatusByPrediction.orders[orderIdx].completeStatus = true;   
                        }

                        //Update the broker status on order status message;
                        return RedisUtils.insertIntoRedis(
                            getRedisClient(), 
                            ORDER_STATUS_BY_PREDICTION_SET,
                            orderStatusByPredictionKey, 
                            JSON.stringify(orderStatusByPrediction)
                        );
                    }
                }
            })
            .then(() => {
                return PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
            })
        }
    })
    .catch(err => {
        console.log(`Open status error - ${err.message}`);
    })
};

function _processOrderExecutionEvent(executionDetails) {
    // console.log('Execution ', executionDetails);
	let predictionId = null;
    let advisorId = null;
    let executionCompleted = false;

    const executionId = _.get(executionDetails, 'execution.execId', null);
    const cumulativeQuantity = _.get(executionDetails, 'execution.cumQty', 0);
    const direction = _.get(executionDetails, "execution.side", "BOT") == "BOT" ? 1 : -1
    const fillQuantity = _.get(executionDetails, 'execution.shares', 0) * direction;
    const avgPrice = _.get(executionDetails, 'execution.avgFillPrice', 0.0);
    const brokerStatus = _.get(executionDetails, 'orderState.status', '');

    const orderId = _.get(executionDetails, 'orderId', null);

    let tradeActivity = {
        date: new Date(), 
        direction: direction == 1 ? "BUY" : "SELL",
        quantity: fillQuantity,
        price: avgPrice,
        automated: true
    };

    let orderStatusByPredictionKey;
            
    return RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId)
    .then(redisOrderExecutionDetailsInstance => {
        if (!redisOrderExecutionDetailsInstance) {
            console.log(`No execution detaisl found for order: ${orderId}`);
            return;
        }

        // console.log('------------Required Order Instance--------------', redisOrderInstance);
        var orderExecutionDetailsInstance = JSON.parse(redisOrderExecutionDetailsInstance);
        
        predictionId = _.get(orderExecutionDetailsInstance, 'predictionId', null);
        advisorId = _.get(orderExecutionDetailsInstance, 'advisorId', null);

        //Create the key for "order status by prediction" set
        orderStatusByPredictionKey = `${advisorId}_${predictionId}`;
        
        var orderedQuantity = _.get(orderExecutionDetailsInstance, 'orderedQuantity', 0)

        //Update "is execution is COMPLETE" flag
        executionCompleted = orderedQuantity == cumulativeQuantity

        // tradeActivity for the particular order instance
        // we check if the execution id already exists in the trade Activity Array
        var tradeActivityArray = _.get(orderExecutionDetailsInstance, 'tradeActivity', []);
        const isExecutionIdPresent = _.findIndex(tradeActivityArray, tradeActivityItem => tradeActivityItem.brokerMessage.execId === executionId) > -1;

        if (!isExecutionIdPresent) {
        	tradeActivity = {...tradeActivity, brokerMessage: executionDetails};
            tradeActivityArray.push(tradeActivity);
            orderExecutionDetailsInstance.tradeActivity = tradeActivityArray

            return RedisUtils.insertIntoRedis(
                getRedisClient(), 
                ORDER_EXECUTION_DETAILS_SET,
                orderId, 
                JSON.stringify(orderExecutionDetailsInstance)
            )
            .then(() => {
                if (executionCompleted) {
                    return _saveTradeActivityToDb(advisorId, predictionId, orderId);
                }
            })
            .then(() => {
                return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_BY_PREDICTION_SET, orderStatusByPredictionKey);
            });

        } else {
            return null;
        }
    })
    .then(redisOrderStatusByPredictionInstance => {
        if (redisOrderStatusByPredictionInstance) {
            var orderStatusByPredictionInstance = JSON.parse(redisOrderStatusByPredictionInstance);
            
            const predictionOrders = _.get(orderStatusByPredictionInstance, 'orders', []);
            const orderIndex = _.findIndex(predictionOrders, orderItem => orderItem.orderId === orderId);

            const accumulatedQuantity = _.get(orderStatusByPredictionInstance, 'accumulated', 0);
            
            //Update the accumulated quantity
            orderStatusByPredictionInstance.accumulated = accumulatedQuantity + fillQuantity

            //Updating the ative/complete status for required prediction
            if (orderIndex > -1) {
                predictionOrders[orderIndex] = {
                    ...predictionOrders[orderIndex],
                    activeStatus: !executionCompleted,
                    completeStatus: executionCompleted,
                    brokerStatus,
                    accQuantity: cumulativeQuantity,
                };

                orderStatusByPredictionInstance.orders = predictionOrders;
            }

            return RedisUtils.insertIntoRedis(
                getRedisClient(), 
                PREDICTION_STATUS_SET,
                orderStatusByPredictionKey, 
                JSON.stringify(orderStatusByPredictionInstance)
            );

        } else {
            return null;
        }
    })
    .then(() => {
        if(advisorId && predictionId) {
            PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
        }
    })
    .catch(err => {
        console.log(`Open execution error - ${err.message}`);
    })
};

module.exports.getPredictionStatus = function(advisorId, predictionId) {
	let orderStatusByPredictionKey = `${advisorId}_${predictionId}`;

    return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_BY_PREDICTION_SET, orderStatusByPredictionKey)
    .then(redisOrderStatusByPredictionInstance => {
        if (redisOrderStatusByPredictionInstance) {
            var orderStatusByPredictionInstance = JSON.parse(redisOrderStatusByPredictionInstance);

            return orderStatusByPredictionInstance;
        }
    });
};

module.exports.getPredictionActivity = function(advisorId, predictionId) {
    let orderStatusByPredictionKey = `${advisorId}_${predictionId}`;

    return RedisUtils.getFromRedis(getRedisClient(), ORDER_STATUS_BY_PREDICTION_SET, orderStatusByPredictionKey)
    .then(redisOrderStatusByPredictionInstance => {
        if (redisOrderStatusByPredictionInstance) {
            var orderStatusByPredictionInstance = JSON.parse(redisOrderStatusByPredictionInstance);
            
            var orderIds = orderStatusByPredictionInstance.orders.map(item => item.orderId);

            return Promise.map(orderIds, function(orderId) {
                return RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId)
                .then(redisOrderExecutionDetailsInstance => {
                    if (redisOrderExecutionDetailsInstance){
                        var orderExecutionDetailsInstance = JSON.parse(redisOrderExecutionDetailsInstance);

                        var tradeActivity = _.get(orderExecutionDetailsInstance, 'tradeActivity', []);
                        var orderActivity = _.get(orderExecutionDetailsInstance, 'orderActivity', []);

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
        return RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId)
        .then(redisOrderExecutionDetailsInstance => {
            if (redisOrderExecutionDetailsInstance){
                var orderExecutionDetailsInstance = JSON.parse(redisOrderExecutionDetailsInstance);

                var advisorId = _.get(orderExecutionDetailsInstance, 'advisorId', null);
                var predictionId = _.get(orderExecutionDetailsInstance, 'predictionId', null);

                var tradeActivity = _.get(orderExecutionDetailsInstance, 'tradeActivity', []);
                var orderActivity = _.get(orderExecutionDetailsInstance, 'orderActivity', []);

                return Promise.all([
                    DailyContestEntryModel.addOrderActivityForPrediction({advisor: advisorId}, predictionId, orderActivity),
                    DailyContestEntryModel.addTradeActivityForPrediction({advisor: advisorId}, predictionId, tradeActivity)
                ]);
            }
        })
        .then(() => {
            return RedisUtils.deleteFromRedis(getRedisClient, ORDER_EXECUTION_DETAILS_SET, orderId);
        })
    }, 60000);
}
