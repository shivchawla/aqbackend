
'use strict';
const _ = require('lodash');
const ib = require('ib');
const config = require('config');
const Promise = require('bluebird');
const moment = require('moment');

const BrokerRedisController = require('./brokerRedisControl');

let isConnected = false;

class InteractiveBroker {
    static connect() {
        return new Promise((resolve, reject) => {
            try {
                const ibInstance = this.interactiveBroker;
                
                ibInstance.connect()
                .on('connected', () => {
                    isConnected = true
                    console.log('Connected to interactive broker');
                    resolve(true)
                })
                .on('disconnected', () => {
                    isConnected = false;
                    console.log('Disconnected');
                    setTimeout(function() {
                        console.log("Reconnecting");
                        InteractiveBroker.interactiveBroker.connect()}, 5000);
                })
                .on('nextValidId', (reqId)  => {
                    console.log('Next Valid Id:', reqId);
                    // return BrokerRedisController.setValidId(reqId)
                    // .then(() => {
                    //     ibInstance.reqExecutions(reqId, {});
                    // })
                    return this.setNextValidId(reqId);

                })
                .on('error', (err) => {
                    console.log(err.message);
                })
            } catch(err) {
                reject(err);
            }
        })
    }

    static setNextValidId(reqId) {
        return BrokerRedisController.setValidId(reqId)
        .then(() => {
            const ibInstance = this.interactiveBroker;

            return (
                Promise.all([
                    ibInstance.reqExecutions(reqId, {}),
                    ibInstance.reqAllOpenOrders()
                ])
            );
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
    static bracketOrder(
            action = 'BUY', 
            quantity = 0, 
            limitPrice = 0, 
            takeProfitLimitPrice = 0, 
            stopLossPrice,
            bracketFirstOrderType = 'LIMIT'
    ) {
        /**
         * How do I pass orderId and parentOrderId to order.limit, since in the ib module it is not being passed
         */
        const ibInstance = this.interactiveBroker;
        let parentOrderConfig = null;
        if (bracketFirstOrderType.toUpperCase() === 'MARKET') {
            parentOrderConfig = ibInstance.order.market(action, quantity);
        } else {
            parentOrderConfig = ibInstance.order.limit(action, quantity, limitPrice, false);
        }

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
            bracketFirstOrderType = 'LIMIT'
    }) {
        const self = this;
        let currentTime;
            
        // There should be orderTypes 
        // for brackets use this https://interactivebrokers.github.io/tws-api/bracket_order.html
        // Getting the interactive broker instance
        
        return Promise.resolve()
        .then(() => {
            if (isConnected) {
                return BrokerRedisController.getValidId(orderType == "bracket" ? 3 : 1)
            } else {
                throw new Error("Not connected");
            }
        })
        .then(orderId => { 
            console.log("OrderId", orderId);
            let orderIds;

            if (orderType == 'bracket') {
                orderIds = [orderId - 2, orderId - 1, orderId];
            } else {
                orderIds = [orderId];
            }
            
            return BrokerRedisController.addOrdersForPrediction(advisorId, predictionId, orderIds)
            .then(() => {
                console.log("OrderIds:", orderIds);
                return orderIds;
            })
        })
        .then(orderIds => {
            const ibInstance = self.interactiveBroker;

            // creating IB stock from the stock param passed
            const ibStock = ibInstance.contract.stock(stock, 'NSE', 'INR');

            if (orderType === 'bracket') {
                var parentId = orderIds[0];
                var profitOrderId = orderIds[1];
                var stopLossOrderId = orderIds[2];

                console.log("WTF");
                const bracketOrderConfig = self.bracketOrder(type, quantity, price, profitLimitPrice, stopLossPrice, bracketFirstOrderType);

                return Promise.all([
                    ibInstance.placeOrder(parentId, ibStock, {...bracketOrderConfig.parentOrder, tif}),
                    ibInstance.placeOrder(profitOrderId, ibStock, {...bracketOrderConfig.profitOrder, parentId, tif}),
                    ibInstance.placeOrder(stopLossOrderId, ibStock, {...bracketOrderConfig.stopLossOrder, parentId, tif})
                ]);   
            } 
            
            else if (orderType === 'limit') {
                const limitOrderConfig = ibInstance.order.limit(type, quantity, price);
                ibInstance.placeOrder(orderIds[0], ibStock, {...limitOrderConfig, tif});
            } 
            
            else if (orderType === 'market') {
                const marketOrderConfig = ibInstance.order.market(type, quantity);
                ibInstance.placeOrder(orderIds[0], ibStock, {...marketOrderConfig, tif});
            }

            else if (orderType === 'stopLimit') {
                const stopLimitOrderConfig = ibInstance.order.stopLimit(type, quantity, price);
                ibInstance.placeOrder(orderIds[0], ibStock, {...stopLimitOrderConfig, tif});
            }

            else if (orderType === 'marketClose') {
                const marketCloseOrderConfig = ibInstance.order.marketClose(type, quantity);
                ibInstance.placeOrder(orderIds[0], ibStock, {...marketCloseOrderConfig, tif});
            }
            
            else {
                throw new Error('Invalid orderType');
            }
           
        })
        .then(() => {
            console.log("ahaah");
            //To make sure that execution detail events are called, force request execution details for the placed orders
            return this.requestExecutionDetails({symbol: stock});
        })
        .catch (err => {
            console.log(err.message);
        })
    }

    static cancelOrder(orderId) {
        return new Promise((resolve, reject) => {
            try {
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                ibInstance.cancelOrder(orderId)
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
    clientId: 0,
    host: config.get('ib_host'),
    port: config.get('ib_port')
})

//Connest to IB server
InteractiveBroker.connect()


/**
 * Handling event 'orderStatus' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld) => {
    // console.log('Event - orderStatus', status);
    // console.log("OrderStatus: ", orderId);

    const orderStatusEvent = {orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld};
    // BrokerRedisController.updateOrderStatus(orderId, statusEvent);
    // 
    BrokerRedisController.addInteractiveBrokerEvent(orderStatusEvent, 'orderStatus');
});

/**
 * Handling event 'orderStatus' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('openOrder', (orderId, contract, order, orderState) => {
    const symbol = _.get(contract, 'symbol', '');
    // console.log('openOrder');
    // console.log(order);
    // console.log("OpenOrder: ", orderId);

    BrokerRedisController.addInteractiveBrokerEvent({orderId, order, orderState}, 'openOrder');

    // BrokerRedisController.updateOpenOrder(orderId, {order, orderState});
});

/**
 * Handling event 'execDetails' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('execDetails', (requestId, contract, execution, orderState) => {
    // console.log('Event - execDetails');
    const orderId = _.get(execution, 'orderId', null);
    // console.log("ExecDetails: ", orderId);
    BrokerRedisController.addInteractiveBrokerEvent({orderId, execution, orderState}, 'execDetails');
});

module.exports = InteractiveBroker;



