
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
                    setTimeout(function() {
                        console.log("Reconnecting");
                        InteractiveBroker.interactiveBroker.connect()}, 5000);
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
                console.log("Getting TWS Time");

                ibInstance.reqCurrentTime()
                .on('currentTime', time => {
                    console.log("NEVER COMES");
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
            tif="GTC",
            predictionId = null,
            advisorId = null,
    }) {
        const self = this;

        let currentTime;
        return new Promise((resolve, reject) => {
            try {
                // There should be orderTypes 
                // for brackets use this https://interactivebrokers.github.io/tws-api/bracket_order.html
                // Getting the interactive broker instance
                const ibInstance = self.interactiveBroker;
                

                return Promise.all([
                    BrokerRedisController.getValidId(type == "bracket" ? 3 : 1),
                    this.getCurrentTime()
                ]) 
                .then(([orderId, time]) => { //Array or value
                    
                    console.log("OrderId: ", orderId);
                    currentTime = moment.unix(time).format('YYYYMMDD HH:mm:ss')
                    console.log(currentTime);

                    // creating IB stock from the stock param passed
                    const ibStock = ibInstance.contract.stock(stock);

                    if (orderType === 'bracket') {
                        var parentId = orderId;

                        var profitOrderId = parentId-1;
                        var stopLossOrderId = parentId-2;
                        const bracketOrderConfig = self.bracketOrder(type, quantity, price, profitLimitPrice, stopLossPrice);

                         ibInstance.placeOrder(parentId, ibStock, {...bracketOrderConfig.parentOrder, tif})
                        ibInstance.placeOrder(profitOrderId, ibStock, {...bracketOrderConfig.profitOrder, parentId, tif})
                        ibInstance.placeOrder(stopLossOrderId, ibStock, {...bracketOrderConfig.stopLossOrder, parentId, tif});    
                        
                        resolve([parentId, profitOrderId, stopLossOrderId]);
                    } 
                    
                    else if (orderType === 'limit') {
                        const limitOrderConfig = ibInstance.order.limit(type, quantity, price);
                        ibInstance.placeOrder(orderId, ibStock, {...limitOrderConfig, tif});
                        resolve([orderId]);
                    } 
                    
                    else if (orderType === 'market') {
                        const marketOrderConfig = ibInstance.order.market(type, quantity);
                        ibInstance.placeOrder(orderId, ibStock, {...marketOrderConfig, tif});
                        resolve([orderId]);
                    }

                    else if (orderType === 'stopLimit') {
                        const stopLimitOrderConfig = ibInstance.order.stopLimit(type, quantity, price);
                        ibInstance.placeOrder(orderId, ibStock, {...stopLimitOrderConfig, tif});
                        resolve([orderId]);
                    }

                    else if (orderType === 'marketClose') {
                        const marketCloseOrderConfig = ibInstance.order.marketClose(type, quantity);
                        ibInstance.placeOrder(orderId, ibStock, {...marketCloseOrderConfig, tif});
                        resolve([orderId]);
                    }
                    
                    else {
                        reject('Invalid orderType')
                    }
                   
                });
            } catch (err) {
                console.log('Err', err);
                reject(err);
            }
        })
        .then(orderIds => {
            //Update redis if order was accompanied with prdictionId/advisorId values
            if (advisorId && predictionId) {
                return BrokerRedisController.addOrdersForPrediction(advisorId, predictionId, orderIds, quantity)
                .then(added => {
                    //To make sure that execution detail events are called, force request execution details for the placed orders
                    this.requestExecutionDetails({symbol: stock, time: currentTime})
                })
            }
        })
        
    }

    static cancelOrder(orderId) {
        return new Promise((resolve, reject) => {
            try {
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                ibInstance.cancelOrder(orderId)
                .on('orderStatus', () => {
                    resolve(orderId);
                })
                .on('error', (err, data) => {
                    reject(err);
                })
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
    host: config.get('ib_host'),
    port: config.get('ib_port')
})

//Connest to IB server
InteractiveBroker.connect()


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



