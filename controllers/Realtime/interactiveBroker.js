
'use strict';
const _ = require('lodash');
const ib = require('ib');
const config = require('config');
const Promise = require('bluebird');
const moment = require('moment');

const BrokerRedisController = require('./brokerRedisControl');
const ibPort = 4002;

class InteractiveBroker {
    static connect() {
        return new Promise((resolve, reject) => {
            try {
                const ibInstance = this.interactiveBroker;
                
                ibInstance.connect()
                .on('connected', () => {
                    console.log('Connected to interactive broker');
                    resolve(true)
                })
                .on('disconnected', () => {
                    console.log('Disconnected');
                    this.interactiveBroker.connect();
                })
                .on('nextValidId', (reqId)  => {
                    console.log('Next Valid Id:', reqId);
                    return BrokerRedisController.setValidId(reqId)
                    .then(() => {
                        ibInstance.reqExecutions(reqId, {});
                    })

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
                this.getNextRequestId()
                .then(reqId => {
                    ibInstance.reqContractDetails(reqId, ibInstance.contract.stock(stock))
                    .on('contractDetails', (reqId, contract) => {
                        resolve({reqId, contract});
                    });
                })
            } catch (err) {
                reject(err);
            }
        })
    }

    static requestExecutionDetails(filter = {}) {
        return new Promise((resolve, reject) => {
            try {
                const ibInstance = this.interactiveBroker;
                this.getNextRequestId()
                .then(reqId => {
                    ibInstance.reqExecutions(reqId, filter);
                    resolve(true);
                })
            } catch (err) {
                reject(err);
            }
        })
    }

    static getNextRequestId() {
        return new Promise((resolve, reject) => {
            try {
                resolve(BrokerRedisController.getValidId());
            }
            catch(err) {
                reject(err);
            }
        })
    }


    static getCurrentTime() {
        return new Promise((resolve, reject) => {
            try {
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                
                ibInstance.reqCurrentTime()
                .on('currentTime', time => {
                    resolve(time); //Long value (milliseconds since epox)
                })
                
            }
            catch(err) {
                reject(err);
            }

        });
    }

    /**
     * Check to see how parentId will be passed
     */
    static bracketOrder(action = 'BUY', quantity = 0, limitPrice = 0, takeProfitLimitPrice = 0, stopLossPrice) {
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
        const stopLossOrderConfig = ibInstance.order.stop(stopLossAction, quantity, stopLossPrice, true);

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
            profitLimitPrice = 0,
            predictionId = null,
            advisorId = null,
    }) {
        const self = this;

        return new Promise((resolve, reject) => {
            try {
                // There should be orderTypes 
                // for brackets use this https://interactivebrokers.github.io/tws-api/bracket_order.html
                // Getting the interactive broker instance
                const ibInstance = self.interactiveBroker;
                let currentTime;

                return Promise.all([
                    BrokerRedisController.getValidId(type == "bracket" ? 3 : 1),
                    this.getCurrentTime()
                ]) 
                .then(([orderId, time]) => { //Array or value
                    
                    currentTime = moment.unix(time).format('YYYYMMDD HH:mm:ss')
                                        
                    // creating IB stock from the stock param passed
                    const ibStock = ibInstance.contract.stock(stock);

                    if (orderType === 'bracket') {
                        var parentId = orderId;

                        var profitOrderId = parentId-1;
                        var stopLossOrderId = parentId-2;
                        const bracketOrderConfig = self.bracketOrder(type, quantity, price, profitLimitPrice, stopLossPrice);

                        ibInstance.placeOrder(parentId, ibStock, bracketOrderConfig.parentOrder)
                        ibInstance.placeOrder(profitOrderId, ibStock, {...bracketOrderConfig.profitOrder, parentId})
                        ibInstance.placeOrder(stopLossOrderId, ibStock, {...bracketOrderConfig.stopLossOrder, parentId});    
                        
                        resolve([parentId, profitOrderId, stopLossOrderId]);
                    } 
                    
                    else if (orderType === 'limit') {
                        const limitOrderConfig = ibInstance.order.limit(type, quantity, price);
                        ibInstance.placeOrder(orderId, ibStock, limitOrderConfig);
                    } 
                    
                    else if (orderType === 'market') {
                        console.log('Creating Market Order');
                        const marketOrderConfig = ibInstance.order.market(type, quantity);
                        ibInstance.placeOrder(orderId, ibStock, marketOrderConfig);
                    }

                    else if (orderType === 'stopLimit') {
                        const stopLimitOrderConfig = ibInstance.order.stopLimit(type, quantity, price);
                        ibInstance.placeOrder(orderId, ibStock, stopLimitOrderConfig);
                    }

                    else if (orderType === 'marketClose') {
                        const marketCloseOrderConfig = ibInstance.order.marketClose(type, quantity);
                        ibInstance.placeOrder(orderId, ibStock, marketCloseOrderConfig);
                    }
                    
                    else {
                        reject('Invalid orderType')
                    }

                    //To make sure that execution detail events are called, force request execution details for the placed orders
                    this.requestExecutionDetails({symbol: stock, time: currentTime})
                    
                    //resolve the orderIds for downstream processing
                    resolve(Array.isArray(orderId) ? orderId : [orderId])
                });
            } catch (err) {
                console.log('Err', err);
                reject(err);
            }
        })
        .then(orderIds => {
            //Update redis if order was accompanied with prdictionId/advisorId values
            if (advisorId && predictionId) {
                return BrokerRedisController.addOrdersForPrediction(advisorId, predictionId, orderIds, quantity);
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
                ibInstance.reqAllOpenOrders();
                resolve();
            } catch(err) {
                reject(err);
            }
        })
    }
}

/**
 * Initializing interactive broker instance to the required config,
 * basic handling of errors and result
 */
InteractiveBroker.interactiveBroker = new ib({
    clientId: 1,
    host: '127.0.0.1',
    port: ibPort
})

//Connest to IB server
InteractiveBroker.connect()

// setTimeout(function() {
//     InteractiveBroker.interactiveBroker.reqIds(1)
//     .on('nextValidId', orderId => {
//         console.log("Seting Valid Id ", orderId);
//         BrokerRedisController.setValidId(orderId);
//     })
// }, 1000);


// setTimeout(function() {
//     console.log("in setTimeout(function() {}, 10);");
//     for (var i=0; i< 10; i++) {
//         InteractiveBroker.interactiveBroker.reqIds(1);
//     }}, 500);

// InteractiveBroker.interactiveBroker.on('nextValidId', orderId  => {
//     console.log('Order Id', orderId);
//     BrokerRedisController.setValidId(orderId);
// })


/**
 * Handling event 'orderStatus' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld) => {
    console.log('Event - orderStatus', status);
    BrokerRedisController.updateOrderStatus(orderId, status)
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
InteractiveBroker.interactiveBroker.on('execDetails', (requestId, contract, execution, orderState) => {
    console.log('Event - execDetails');
    const orderId = _.get(execution, 'orderId', null);
    BrokerRedisController.updateOrderExecution(orderId, execution);
});

module.exports = InteractiveBroker;



