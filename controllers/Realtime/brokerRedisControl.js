/*
* @Author: Shiv Chawla
* @Date:   2019-03-16 13:33:59
* @Last Modified by:   Shiv Chawla
* @Last Modified time: 2019-04-01 14:00:03
*/

const redis = require('redis');
const config = require('config');
const _ = require('lodash');
const Promise = require('bluebird');
const schedule = require('node-schedule');
const moment = require('moment');
const DateHelper = require('../../utils/Date');

const RedisUtils = require('../../utils/RedisUtils');
const PredictionRealtimeController = require('./predictionControl');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');

let redisClient;

const ORDER_EXECUTION_DETAILS_SET = `orderExecutionDetailSet_${process.env.NODE_ENV}`;
const ORDER_STATUS_BY_PREDICTION_SET = `orderStatusByPredictionSet_${process.env.NODE_ENV}`;
const ORDER_PROCESSING_COMPLETED = `orderProcessingCompleted_${process.env.NODE_ENV}`;

const IB_EVENTS = `interactiveBrokerEvents_${process.env.NODE_ENV}`;

let EVENT_PROCESS_FLAG = false;

const ValidIdKey = `ValidId_${process.env.NODE_ENV}`;
const processIBEventsChannel = `processIBEvents_${process.env.NODE_ENV}`;

//Temporary hash to send order submitted from the program (may or may not hit IB servers)
const TEMP_ORDER_TO_PREDICTION_SET = `orderToPredictionSet_${process.env.NODE_ENV}`;

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

module.exports.updateOrderToClientMap = function(orderId, clientId) {
    return RedisUtils.addSetDataToRedis(getRedisClient(), `clientToOrderMap_${clientId}_${process.env.NODE_ENV}`, orderId);
};

module.exports.setValidId = function(validId) {
    return RedisUtils.insertKeyValue(getRedisClient(), ValidIdKey, validId)
};

module.exports.getValidId = function(increment=1) {
    let reqId;

    return new Promise((resolve, reject) => {
        RedisUtils.incValue(getRedisClient(), ValidIdKey, increment)
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
        return RedisUtils.publish(getRedisClient(), processIBEventsChannel, 1);
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
            })
            .then(data => {
                const tradeActivity = Array.prototype.concat.apply([], data.map(dataItem => dataItem.tradeActivity));
                const orderActivity = Array.prototype.concat.apply([], data.map(dataItem => dataItem.orderActivity));
                const requiredData = {tradeActivity, orderActivity};

                return requiredData;
            })

        } else {
            return null;
        }
    })
};

module.exports.addLatestBarData = function(ticker, latestBarData) {
    const convertedTime = DateHelper.convertIndianTimeInLocalTz(latestBarData.datetime, 'yyyymmdd HH:mm:ss').endOf('minute').set({millisecond:0}).toISOString();
    latestBarData = {...latestBarData, datetime: convertedTime};

    //Update the data in redis
    var redisSetKey = `RtData_IB_${activeTradingDate.utc().format("YYYY-MM-DDTHH:mm:ss[Z]")}_${ticker}`;
    var nextMarketOpen = DateHelper.getMarketOpenDateTime(DateHelper.getNextNonHolidayWeekday());

    return RedisUtils.addSetDataToRedis(getRedisClient(), redisSetKey, JSON.stringify(latestBarData))
    .then(() => {    
        //Set key expiry              
        return RedisUtils.expireKeyInRedis(getRedisClient(), redisSetKey, Math.floor(nextMarketOpen.valueOf()/1000));
    })
};

module.exports.processIBEvents = function() {
    
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
                // console.log('Redis Ib Event', redisIBEvent);

                var eventType = _.get(ibEvent, 'eventType', '');
                // console.log('Event Type ', eventType);

                if(eventType == '') {
                    throw new Error("Invalid eventType");
                }

                var eventDetails = _.get(ibEvent, 'eventDetails', {});

                const orderId = _.get(eventDetails, 'orderId', null);
                // console.log(`About to process: ${eventType} for ${orderId}`);

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
        return exports.processIBEvents();
    })
    .catch(err => {
        // EVENT_PROCESS_FLAG = false;
        console.log('Error 171 --------------------------->', err.message);
    });
};


module.exports.addHistoricalData = function(reqId, data) {
    RedisUtils.addSetDataToRedis(getRedisClient(), `historicalData-${reqId}_${process.env.NODE_ENV}`, JSON.stringify(data));
}

module.exports.getHistoricalData = function(reqId, data) {
    let redisSetKey = `historicalData-${reqId}_${process.env.NODE_ENV}`;
    return RedisUtils.getSetDataFromRedis(getRedisClient(), redisSetKey)
    .then(data => {
        return Promise.all([
            Promise.resolve(data.map(item => {return JSON.parse(item)})),
            RedisUtils.expireKeyInRedis(getRedisClient(), redisSetKey, Math.floor(moment().valueOf()/1000))
        ])
    })
    .then(([data,]) => {
        return data;
    })
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
            return Promise.all([
                RedisUtils.getFromRedis(getRedisClient(), TEMP_ORDER_TO_PREDICTION_SET, orderId),
                RedisUtils.getFromRedis(getRedisClient(), ORDER_PROCESSING_COMPLETED, orderId),
                RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId)
            ])                
        } else {
            throw new Error("Error while processiing open order: Invalid OrderId");
        }
    })
    .then(([redisOrderToPredictionKey, alreadyProcessedFlag, redisOrderExecutionDetailsInstance]) => {

        if (alreadyProcessedFlag) {
            throw new Error("Order has alrady been processed competely!!!");
        }

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

            return Promise.resolve()
            .then(() => {
                if (redisOrderExecutionDetailsInstance) {
                    var orderExecutionDetailsInstance = JSON.parse(redisOrderExecutionDetailsInstance);
                    // console.log('From IB brokerMessage');
                    // console.log('orderExecutionDetailsInstance ----------->', orderExecutionDetailsInstance);
                    let openOrderActivities = _.get(orderExecutionDetailsInstance, 'orderActivity', [])
                        .filter(orderActivityItem => {
                            return (
                                orderActivityItem.activityType === 'openOrder' && 
                                _.isEqual(
                                    _.get(openOrderDetails, 'orderState.status', null), 
                                    _.get(orderActivityItem, 'brokerMessage.orderState.status', null)
                                )
                            );
                        })
                    // console.log('openOrderActivities ----->', openOrderActivities);
                    // console.log('I Order State ----------> ', openOrderDetails.orderState);
                    // console.log("Order is already present in ORDER_EXECUTION_DETAILS_SET!! Appending Open Order info!!");
                    // Deep comparing with all the openOrder activities. If there exists an openOrder activity
                    // with the same brokerMessage, then throw an error
                    if (openOrderActivities.length > 0) {
                        // console.log('O Order State ----------> ', openOrderActivities[0].brokerMessage.orderState);
                        // console.log('Equals ---> ',_.isEqual(openOrderDetails.orderState, openOrderActivities[0].brokerMessage.orderState));      
                        // console.log('Duplicate Broker Message ------------------->');
                        throw new Error('Skipping openOrder event');
                    }
                    
                    orderExecutionDetailsInstance.orderActivity.push(orderActivity);

                    return RedisUtils.insertIntoRedis(
                        getRedisClient(), 
                        ORDER_EXECUTION_DETAILS_SET,
                        orderId, 
                        JSON.stringify(orderExecutionDetailsInstance)
                    );

                } else {
                    // console.log(`Initializing order: ${orderId} in ORDER_EXECUTION_DETAILS_SET`);
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
                    );
                }    
            })
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
            activeStatus: status != 'Filled',
            completeStatus: status == 'Filled',
            brokerStatus: status,
            accQuantity: 0,
            totalQuantity: quantity,
        };

        if (redisOrderStatusByPrediction) {
            orderStatusByPrediction = JSON.parse(redisOrderStatusByPrediction);
            const orderIdx = _.findIndex(orderStatusByPrediction.orders, orderItem => {
                return orderItem.orderId === orderId
            });
            if (orderIdx > -1) {
                if (orderStatusByPrediction.orders[orderIdx].brokerStatus != 'Filled') {
                    orderStatusByPrediction.orders[orderIdx] = openOrderInstance;
                }
            } else {
                orderStatusByPrediction.orders.push(openOrderInstance);
            }
            // console.log("Adding order to list of orders for prediction");
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

    return Promise.all([
        RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId),
        RedisUtils.getFromRedis(getRedisClient(), ORDER_PROCESSING_COMPLETED, orderId)
    ])
    .then(([redisOrderExecutionDetailsInstance, alreadyProcessedFlag]) => {
        if (alreadyProcessedFlag) {
            throw new Error("Order already processed completed!!");
        }

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

        let orderStatusActvities = []
        try {
            orderStatusActvities = _.get(orderExecutionDetailsInstance, 'orderActivity', [])
                .filter(orderActivityItem => {
                    return (
                        orderActivityItem.activityType === 'orderStatus' && 
                        _.isEqual(
                            orderStatusDetails, 
                            _.get(orderActivityItem, 'brokerMessage', {})
                        )
                    );
                });

            // console.log('orderStatusActivities ----->', orderStatusActvities);
            // console.log('I Order Status ----------> ', orderStatusDetails.status);
            // console.log("Order is already present in ORDER_EXECUTION_DETAILS_SET!! Appending Open Order info!!");
            // Deep comparing with all the openOrder activities. If there exists an openOrder activity
            // with the same brokerMessage, then throw an error
            if (orderStatusActvities.length > 0) {
                // console.log('O Order Status ----------> ', orderStatusActvities[0].brokerMessage.status);
                // console.log('Equals ---> ',_.isEqual(orderStatusDetails, orderStatusActvities[0].brokerMessage))
                // console.log('Duplicate For Order Status Broker Message ------------------->');
                throw new Error('Skipping orderStatus event');
            }
        } catch (err) {
            console.log('Error Order Status ', err);
        }
        
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
                        if (orderStatusByPrediction.orders[orderIdx].brokerStatus != 'Filled') {
                            orderStatusByPrediction.orders[orderIdx].brokerStatus = status;
                            
                            if (status == 'Cancelled' || status == "Inactive") {
                                orderStatusByPrediction.orders[orderIdx].activeStatus = false;
                            }
                        
                        }

                        // if (status == 'Filled') {
                        //      orderStatusByPrediction.orders[orderIdx].activeStatus = false;
                        //      orderStatusByPrediction.orders[orderIdx].completeStatus = true;  
                        // }

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
    const fillQuantity = Number(_.get(executionDetails, 'execution.shares', 0));
    // console.log('Fill Quantity -------> ', fillQuantity);
    const avgPrice = _.get(executionDetails, 'execution.avgPrice', 0.0);
    // const brokerStatus = _.get(executionDetails, 'orderState.status', '');

    // console.log('Execution Details ======> ', executionDetails);

    const orderId = _.get(executionDetails, 'orderId', null);

    let tradeActivity = {
        date: new Date(), 
        direction: direction == 1 ? "BUY" : "SELL",
        quantity: fillQuantity,
        price: avgPrice,
        automated: true
    };

    let orderStatusByPredictionKey;
            
    return Promise.all([
        RedisUtils.getFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId),
        RedisUtils.getFromRedis(getRedisClient(), ORDER_PROCESSING_COMPLETED, orderId)
    ])
    .then(([redisOrderExecutionDetailsInstance, alreadyProcessedFlag]) => {

        if (alreadyProcessedFlag) {
            throw new Error("Order already processed completely");
        }

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
        executionCompleted = orderedQuantity == cumulativeQuantity;
        // console.log('Execution Completed ===>', executionCompleted);
        // console.log('Ordered Quantity ===>', orderedQuantity);
        // console.log('Cumulative Quantity ===>', cumulativeQuantity);


        // tradeActivity for the particular order instance
        // we check if the execution id already exists in the trade Activity Array
        var tradeActivityArray = _.get(orderExecutionDetailsInstance, 'tradeActivity', []);
        const isExecutionIdPresent = _.findIndex(tradeActivityArray, tradeActivityItem => tradeActivityItem.brokerMessage.execId === executionId) > -1;

        if (!isExecutionIdPresent) {
            tradeActivity = {...tradeActivity, brokerMessage: executionDetails.execution};
            tradeActivityArray.push(tradeActivity);
            orderExecutionDetailsInstance.tradeActivity = tradeActivityArray;

            // console.log(`Adding trade activity: ${orderId}`);
            // console.log("Trade Activity");
            // console.log(tradeActivityArray);

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
            throw new Error('Execution Id already exists');
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
            orderStatusByPredictionInstance.accumulated = accumulatedQuantity + (direction * fillQuantity);
            // console.log('accumulatedQuantity --------->', accumulatedQuantity);
            // console.log('cumulativeQuantity --------->', cumulativeQuantity);
            // console.log('orderStatusByPredictionInstance.accumulated --------->', orderStatusByPredictionInstance.accumulated);

            //Updating the ative/complete status for required prediction
            // console.log('Required Order Index for prediction order is ========>', orderIndex)
            if (orderIndex > -1) {
                // console.log(`Prediction order for index ${orderIndex} will be updated ========>`);
                predictionOrders[orderIndex] = {
                    ...predictionOrders[orderIndex],
                    activeStatus: !executionCompleted,
                    completeStatus: executionCompleted,
                    brokerStatus: executionCompleted ? "Filled" : predictionOrders[orderIndex].brokerStatus,
                    accQuantity: cumulativeQuantity,
                };

                // console.log('Updated Prediction Orders ======>', predictionOrders[orderIndex]);

                orderStatusByPredictionInstance.orders = predictionOrders;

                return RedisUtils.insertIntoRedis(
                    getRedisClient(), 
                    ORDER_STATUS_BY_PREDICTION_SET,
                    orderStatusByPredictionKey, 
                    JSON.stringify(orderStatusByPredictionInstance)
                );
            }

        } else {
            return null;
        }
    })
    .then(() => {
        if(advisorId && predictionId) {
            return PredictionRealtimeController.sendAdminUpdates(advisorId, predictionId);
        }
    })
    .catch(err => {
        console.log(`Open execution error - ${err.message}`);
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
            return Promise.all([
                RedisUtils.insertIntoRedis(getRedisClient(), ORDER_PROCESSING_COMPLETED, orderId, "1"),
                RedisUtils.deleteFromRedis(getRedisClient(), ORDER_EXECUTION_DETAILS_SET, orderId)
            ])
        })
    }, 60000);
}
