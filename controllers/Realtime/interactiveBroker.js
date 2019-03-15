'use strict';
const _ = require('lodash');
const ib = require('ib');
const redis = require('redis');
const config = require('config');

const RedisUtils = require('../../utils/RedisUtils');
const DailyContestEntryModel = require('../../models/Marketplace/DailyContestEntry');

const ibPort = 4002;
let redisClient;

function getRedisClient() {
	if (!redisClient || !redisClient.connected) {
        redisClient = redis.createClient(config.get('node_redis_port'), config.get('node_redis_host'), {password: config.get('node_redis_pass')});
    }

    return redisClient; 
}

class InteractiveBroker {
    static connect() {
        return new Promise((resolve, reject) => {
            try {
                this.interactiveBroker.connect()
                .on('connected', () => {
                    resolve(true, 'Connected');
                })
                .on('disconnected', () => {
                    console.log('Disconnected');
                    this.interactiveBroker.connect();
                })
            } catch(err) {
                reject(err);
            }
        })
    }

    static requireContractDetails(stock) {
        return new Promise((resolve, reject) => {
            try {
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                this.getNextOrderId()
                .then(orderId => {
                    ibInstance.reqContractDetails(orderId, ibInstance.contract.stock(stock))
                    .on('contractDetails', (orderId, contract) => {
                        resolve({orderId, contract});
                    });
                })
            } catch (err) {
                reject(err);
            }
        })
    }

    static requestExecutionDetails() {
        return new Promise((resolve, reject) => {
            try {
                const ibInstance = this.interactiveBroker;
                this.getNextOrderId()
                .then(orderId => {
                    ibInstance.reqExecutions(orderId, {});
                    resolve(true);
                })
            } catch (err) {
                reject(err);
            }
        })
    }

    static getNextOrderId() {
        return new Promise((resolve, reject) => {
            try {
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                ibInstance.reqIds(-1)
                .on('nextValidId', orderId => {
                    resolve(orderId);
                })
            }
            catch(err) {
                reject(err);
            }
        })
    }

    /**
     * Check to see how parentId will be passed
     */
    static bracketOrder(parentOrderId, action = 'BUY', quantity = 0, limitPrice = 0, takeProfitLimitPrice = 0, stopLossPrice) {
        /**
         * How do I pass orderId and parentOrderId to order.limit, since in the ib module it is not being passed
         */
        const ibInstance = this.interactiveBroker;
        const parentOrderConfig = ibInstance.order.limit(action, quantity, limitPrice, false);

        // Action used for takeProfitOrderConfig
        const takeProfitAction = action === 'BUY' ? 'SELL' : action;
        const takeProfitOrderConfig = ibInstance.order.limit(takeProfitAction, quantity, takeProfitLimitPrice, false);

        // Action used for stopLossOrderConfig
        const stopLossAction = action === 'BUY' ? 'SELL' : action;
        const stopLossOrderConfig = ibInstance.order.stop(stopLossAction, quantity, stopLossPrice, true, parentOrderId);

        return {
            parentOrder: parentOrderConfig,
            profitOrder: takeProfitOrderConfig,
            stopLossOrder: stopLossOrderConfig
        }
    }

    static placeOrder({
            stock, 
            type = 'BUY', 
            quantity = 0, 
            price = 0, 
            orderType = 'bracket',
            stopLossPrice = 0,
            profitLimitPrice = 0
    }) {
        const self = this;

        return new Promise((resolve, reject) => {
            try {
                // There should be orderTypes 
                // for brackets use this https://interactivebrokers.github.io/tws-api/bracket_order.html
                // Getting the interactive broker instance
                const ibInstance = self.interactiveBroker;
                this.getNextOrderId()
                .then(orderId => {
                    console.log('Next Order Id', orderId);
                    // creating IB stock from the stock param passed
                    const ibStock = ibInstance.contract.stock(stock);

                    if (orderType === 'bracket') {
                        const bracketOrderConfig = self.bracketOrder(orderId, type, quantity, price, profitLimitPrice, stopLossPrice);
                        ibInstance.placeOrder(orderId, ibStock, bracketOrderConfig.parentOrder);
                        ibInstance.placeOrder(orderId + 1, ibStock, bracketOrderConfig.profitOrder);
                        ibInstance.placeOrder(orderId + 2, ibStock, bracketOrderConfig.stopLossOrder);
                        
                        // Resolving all the orderId that are being used to place the orders
                        resolve([orderId, orderId + 1, orderId + 2]);
                    } 
                    
                    else if (orderType === 'limit') {
                        const limitOrderConfig = ibInstance.order.limit(type, quantity, price);
                        ibInstance.placeOrder(orderId, ibStock, limitOrderConfig);

                        resolve(orderId);
                    } 
                    
                    else if (orderType === 'market') {
                        console.log('Creating Market Order');
                        const marketOrderConfig = ibInstance.order.market(type, quantity);
                        ibInstance.placeOrder(orderId, ibStock, marketOrderConfig);

                        resolve(orderId);
                    }

                    else if (orderType === 'stopLimit') {
                        const stopLimitOrderConfig = ibInstance.order.stopLimit(type, quantity, price);
                        ibInstance.placeOrder(orderId, ibStock, stopLimitOrderConfig);

                        resolve(orderId);
                    }

                    else if (orderType === 'marketClose') {
                        const marketCloseOrderConfig = ibInstance.order.marketClose(type, quantity);
                        ibInstance.placeOrder(orderId, ibStock, marketCloseOrderConfig);
                    }
                    
                    else {
                        reject('Invalid orderType')
                    }
                });
            } catch (err) {
                reject(err);
            }
        })
    }

    static cancelOrder(orderId) {
        return new Promise((resolve, reject) => {
            try {
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                ibInstance.cancelOrder(orderId);
                resolve(orderId);
            } catch(err) {
                reject(err);
            }
        });
    }

    static requestOpenOrders() {
        return new Promise((resolve, reject) => {
            try {
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                ibInstance.reqAllOpenOrders()
                .on('openOrder', (orderId, contract, order, orderState) => {
                    resolve({orderId, contract, order, orderState});
                })
            } catch(err) {
                reject(err);
            }
        })
    }
}

/**
 * Initializing interactive broker instance to the required config,
 * basic handling of erros and result
 */
InteractiveBroker.interactiveBroker = new ib({
    clientId: 1,
    host: '127.0.0.1',
    port: ibPort
})
.on('error', err => {
    console.error(err);
})
.on('connected', () => {
    console.log('Interactive Broker Connected');
})
.on('result', (event, args) => {
});

module.exports = InteractiveBroker;

InteractiveBroker.connect();

/**
 * Handling event 'orderStatus' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld) => {
    // console.log('Event - orderStatus', orderId, 'Filled', filled);
    let predictionId = null;
    let advisorId = null;
    /**
     * id: orderId
     * we will store a map in redis, something like this
     * {orderId: {advisorId, predictionId}}
     * Using the orderId we will be able to get the required advisorId and predictionId, which we
     * will store in the 2 variables below accordingly
     */
    // Promise.resolve()
    // .then(() => RedisUtils.getFromRedis(getRedisClient(), 'orderPredictions', `ib_order_${orderId}`))
	// .then(orderData => {
    //     orderData = JSON.parse(orderData);
    //     advisorId = _.get(orderData, 'advisorId', null);
    //     predictionId = _.get(orderData, 'predictionId', null);
    // })
    // .then(() => DailyContestEntryModel.fetchPredictionById({advisor: advisorId}, predictionId))
    // .then(prediction => {
    //     console.log('Prediction', prediction);
        // Obtaining positions that are remaining in the prediction obtained from the db
        // const remainingPositions = _.get(prediction, 'trade.remaining', null);
        // const accumulated = _.get(prediction, 'accumulated', null);
        // const tradeActivityItem = {
        //     category: 'ORDER_MODS', 
        //     date: new Date(), 
        //     tradeType,
        //     tradeDirection,
        //     automated: false,
        //     notes: '',
        //     brokerMessage: {
        //         status, filled, remaining, avgFillPrice, permId,
        //         parentId, lastFillPrice, clientId, whyHeld
        //     }
        // };

        // /**
        //  * If positions remaining is not 0 and if the remaining received is not same as 
        //  * the old one received
        //  */
        // if (remaining !== 0 && remainingPositions !== remaining) {
        //     if (accumulated === null) {
        //         accumulated = filled;
        //     } else {
        //         accumulated += filled;
        //     }
        // }
        // prediction.trade = {
        //     ...prediction.trade,
        //     remaining: remaining,
        //     accumulated
        // };
        // prediction.tradeActivity.push(tradeActivityItem);

        // return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction);
    // })
    // return;
    // .then(prediction => {
    //     if (prediction !== null) {
    //         console.log('Prediction Updated', prediction);
    //     } else {
    //         console.log('Prediction Ended');
    //     }
    // })
});

/**
 * Handling event 'orderStatus' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('openOrder', (orderId, contract, order, orderState) => {
    const symbol = _.get(contract, 'symbol', '');
    console.log('openOrder - ' + order);
    // console.log('Event - openOrder');
    // console.log('Order Id', orderId, symbol);
    // console.log('Order ', order);
    // console.log('order', order);
    // console.log('orderState', orderState);
    /**
     * id: orderId
     * we will store a map in redis, something like this
     * {orderId: {advisorId, predictionId}}
     * Using the orderId we will be able to get the required advisorId and predictionId, which we
     * will store in the 2 variables below accordingly
     */
    // const predictionId = null;
    // const advisorId = null;
    // DailyContestEntryModel.fetchPredictionById({advisor: advisorId}, predictionId)
    // .then(prediction => {
    //     /**
    //      * The activity item that will be pushed the trade activity array for each prediction
    //      */
    //     const tradeActivityItem = {
    //         category: 'ORDER_MODS', 
    //         date: new Date(), 
    //         tradeType,
    //         tradeDirection,
    //         automated: false,
    //         notes: '',
    //         brokerMessage: {
    //             ...order,
    //             orderState
    //         }
    //     };
    //     prediction.tradeActivity.push(tradeActivityItem);

    //     return DailyContestEntryModel.updatePrediction({advisor: advisorId}, prediction);
    // })
    // .then(prediction => {
    //     if (prediction !== null) {
    //         console.log('Prediction Updated', prediction);
    //     } else {
    //         console.log('Prediction Ended');
    //     }
    // })
});

/**
 * Handling event 'execDetails' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('execDetails', (requestId, contract, order, orderState) => {
    const orderId = _.get(order, 'orderId', null);
    const executionId = _.get(order, 'execId', null);
    const cumulativeQuantity = _.get(order, 'cumQty', -1);
    let executionDetailArray = [];
    // let us assume the ordered quantity is 100, this should also be obtained from the redis kvp
    let orderedQuantity = 0;

    let orderInstance = null;
    let orderPredictionId = null;
    let orderAdvisorId = null;

    console.log('Event - execDetails');
    console.log('Order Id', orderId);
    console.log('execution Id', executionId);

    Promise.resolve()
    .then(() => RedisUtils.getFromRedis(getRedisClient(), 'orderForPredictions', orderId))
    .then(redisOrderInstance => {
        console.log('------------Required Order Instance--------------', redisOrderInstance);
        redisOrderInstance = JSON.parse(redisOrderInstance);
        orderInstance = redisOrderInstance;
        orderPredictionId = _.get(redisOrderInstance, 'predictionId', null);
        orderAdvisorId = _.get(redisOrderInstance, 'advisorId', null);
        orderedQuantity = _.get(redisOrderInstance, 'orderedQuantity', 0)

        // execution detail for the particular order instance
        // we check if the execution id already exists in the execution detail array
        executionDetailArray = _.get(redisOrderInstance, 'executionDetail', []);
        const isExecutionIdPresent = _.findIndex(executionDetailArray, executionDetailItem => executionDetailItem.executionId === executionId) > -1;

        if (!isExecutionIdPresent) {
            return RedisUtils.getFromRedis(getRedisClient(), 'ibPredictions', orderPredictionId);

        } else {
            return null;
        }
    })
    .then(redisPredictionInstance => {
        if (redisPredictionInstance !== null) {
            redisPredictionInstance = JSON.parse(redisPredictionInstance);
            const predictionOrders = _.get(redisPredictionInstance, 'orders', []);
            const orderIndex = _.findIndex(predictionOrders, orderItem => orderItem.orderId === orderId);

            if (cumulativeQuantity === orderedQuantity) {
                // execution finished 
                // execution detail should be saved in the database

                // updating order for required prediction
                if (orderIndex > -1) {
                    predictionOrders[orderIndex] = {
                        ...predictionOrders[orderIndex],
                        activeStatus: false,
                        completeStatus: true
                    };
                }
                
                // deleting order from orderForPredictions dictionary
                return RedisUtils.deleteFromRedis(getRedisClient(), 'orderForPredictions', orderId);

            } else {
                // execution not completed yet
                redisPredictionInstance.accumulated = cumulativeQuantity;
                executionDetailArray.push({
                    executionId, 
                    ...order
                });
                orderInstance.executionDetail = executionDetailArray;
                return Promise.all([
                    RedisUtils.insertIntoRedis(
                        getRedisClient(), 
                        'orderForPredictions', 
                        orderId, 
                        JSON.stringify(orderInstance)
                    )
                    ,RedisUtils.insertIntoRedis(
                        getRedisClient(), 
                        'ibPredictions', 
                        orderPredictionId, 
                        JSON.stringify(redisPredictionInstance)
                    )
                ])
            }
        } else {
            return null;
        }
    })
    .then(response => {
        if (response !== null) {
            console.log('Successfully Updated');
        } else {
            console.log('Error or duplicate execution id')
        }
    });
});