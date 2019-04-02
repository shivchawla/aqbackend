
'use strict';
const _ = require('lodash');
const ib = require('ib');
const config = require('config');
const Promise = require('bluebird');
const schedule = require('node-schedule');
const serverPort = require('../../index').serverPort;

const BrokerRedisController = require('./brokerRedisControl');
const DateHelper = require('../../utils/Date');

const ibTickers = require('../../documents/ibTickers.json');
const indices = require('../../documents/indices.json');

let isConnected = false;

let promises = {};

function initializeCallback(reqId, resolve, reject) {
    promises[reqId] = {resolve, reject};
}

function deleteCallback(reqId) {
    delete promises[reqId]; 
}

class InteractiveBroker {
    static connect() {
        try {
            const ibInstance = this.interactiveBroker;   
            ibInstance.connect()
         
        } catch(err) {
            console.log(err.message);
        }
    }

    static setNextValidId(reqId) {
        return BrokerRedisController.setValidId(reqId)
    }

    static getExecutionsAndOpenOrders() {
        return this.getNextRequestId()
        .then(reqId => {
            const ibInstance = this.interactiveBroker;

            return  Promise.all([
                ibInstance.reqExecutions(reqId, {}),
                ibInstance.reqOpenOrders()
            ]);
        })
    }

    static requireContractDetails(stock) {
        const self = this;
        return new Promise((resolve, reject) => {
            self.getNextRequestId()
            .then(reqId => {
                // Getting the interactive broker instance
                const ibInstance = self.interactiveBroker;
                ibInstance.reqContractDetails(reqId, ibInstance.contract.index(stock, "INR", "NSE"))
                .on('contractDetails', (reqId, contract) => {
                    resolve({reqId, contract});
                });
            })
            .catch(err => {
                reject(err.message);    
            })
        })
    }

    static requestIntradayHistoricalData(stock, options = {}) {
        return new Promise((resolve, reject) => {
          
            let requestId; 
            this.getNextRequestId()
            .then(reqId => {
                
                requestId = reqId;

                let duration = _.get(options, 'duration', '1 D');
                let isIndex = _.get(options, 'isIndex', false);

                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                let contract;

                var ibTicker = this.getRequiredSymbol(stock);
                                    
                if (isIndex) {
                    contract = ibInstance.contract.index(ibTicker, 'INR', 'NSE');
                } else {
                    contract = ibInstance.contract.stock(ibTicker, 'NSE', 'INR');
                }

                initializeCallback(reqId, resolve, reject);
                ibInstance.reqHistoricalData(reqId, contract, '', duration, '1 min', 'TRADES', 1, 1, false)

            })
            .catch(err => {
                deleteCallback(requestId);
                reject(err);
            })
        })
    }

    static getRequiredSymbol(symbol) {
        const ibSymbol = ibTickers[symbol];

        if (ibSymbol) {
            return ibSymbol;
        }

        return symbol;
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
            parentOrderConfig = ibInstance.order.market(action, quantity, false);
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

    static placeOrderInternal(orderId, contract, config) {
        return new Promise((resolve, reject) => {
            initializeCallback(orderId, resolve, reject);
            const ibInstance = self.interactiveBroker;
            ibInstance.placeOrder(orderId, contract, config)
            .then(() => {
                RedisBrokerController.updateOrderToClientMap(orderId, serverPort);
            })
        });
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

        return new Promise((resolve, reject) => {
            const self = this;
                
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

                let orderIds;

                if (orderType == 'bracket') {
                    orderIds = [orderId - 2, orderId - 1, orderId];
                } else {
                    orderIds = [orderId];
                }
                
                return BrokerRedisController.addOrdersForPrediction(advisorId, predictionId, orderIds)
                .then(() => {
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

                    const bracketOrderConfig = self.bracketOrder(type, quantity, price, profitLimitPrice, stopLossPrice, bracketFirstOrderType);

                    return Promise((resolve, reject) => {
                        return Promise.all([
                            this.placeOrderInternal(parentId, ibStock, {...bracketOrderConfig.parentOrder, tif}),
                            this.placeOrderInternal(profitOrderId, ibStock, {...bracketOrderConfig.profitOrder, parentId, tif}),
                            this.placeOrderInternal(stopLossOrderId, ibStock, {...bracketOrderConfig.stopLossOrder, parentId, tif})
                        ])
                        .then(() => {
                            //if call orders are successful
                            resolve(true);
                        })
                        .catch(err => {
                            console.log("Error in one of the legs of bracket orders");
                            console.log("Cancelling all legs");

                            //What to do when place order fails
                            return Promise.map(orderIds, function(orderId) {
                                return this.cancelOrder(orderId);
                            })
                            .then(() => {
                                reject(err);
                            })
                        })
                    })
                } 
                
                else if (orderType === 'limit') {
                    const limitOrderConfig = ibInstance.order.limit(type, quantity, price);
                    this.placeOrderInternal(orderIds[0], ibStock, {...limitOrderConfig, tif});
                } 
                
                else if (orderType === 'market') {
                    const marketOrderConfig = ibInstance.order.market(type, quantity);
                    this.placeOrderInternal(orderIds[0], ibStock, {...marketOrderConfig, tif});
                }

                else if (orderType === 'stopLimit') {
                    const stopLimitOrderConfig = ibInstance.order.stopLimit(type, quantity, price);
                    this.placeOrderInternal(orderIds[0], ibStock, {...stopLimitOrderConfig, tif});
                }

                else if (orderType === 'marketClose') {
                    let goodAfterTime = DateHelper.convertLocaTimeToIndiaTz(DateHelper.getMarketCloseDateTime().subtract(5, 'minutes')).format('YYYYMMDD HH:mm:ss');
                    let marketCloseOrderConfig = ibInstance.order.market(type, quantity, true, goodAfterTime);
                    this.placeOrderInternal(orderIds[0], ibStock, {...marketCloseOrderConfig, tif});
                }

                else if (orderType === 'marketIfTouched') {
                    let marketIfTouchedOrderConfig = ibInstance.order.market(type, quantity);
                    marketIfTouchedOrderConfig = {
                        ...marketIfTouchedOrderConfig,
                        orderType: 'MIT',
                        totalQuantity: quantity,
                        auxPrice: price,
                        tif
                    };

                    this.placeOrderInternal(orderIds[0], ibStock, marketIfTouchedOrderConfig);
                }
                
                else {
                    throw new Error('Invalid orderType');
                }
               
            })
            .then(() => {
                //To make sure that execution detail events are called, force request execution details for the placed orders
                return this.requestExecutionDetails({symbol: stock});
            })
            .then(() => {
                //All order were successful
                resolve(true);
            })
            .catch(err => {
                reject(err);
                console.log(err.message);
            })
        });
    }

    static modifyOrder({
        orderId,
        stock, 
        type = 'BUY', 
        quantity = 0, 
        price = 0, 
        orderType = 'market',
        tif="GTC",
    }) {

        return new Promise((resolve, reject) => {
            Promise.resolve()
            .then(() => {

                const ibInstance = this.interactiveBroker;

                // creating IB stock from the stock param passed
                const ibStock = ibInstance.contract.stock(stock, 'NSE', 'INR');

                if (!isConnected) {
                    throw new Error("Not connected");
                }

                if (orderType === 'LMT') {
                    const limitOrderConfig = ibInstance.order.limit(type, quantity, price);
                    this.placeOrderInternal(orderId, ibStock, {...limitOrderConfig, tif});
                } 
                
                else if (orderType === 'MKT') {
                    const marketOrderConfig = ibInstance.order.market(type, quantity);
                    this.placeOrderInternal(orderId, ibStock, {...marketOrderConfig, tif});
                }

                else if (orderType === 'STP') {
                    const stopLimitOrderConfig = ibInstance.order.stopLimit(type, quantity, price);
                    this.placeOrderInternal(orderId, ibStock, {...stopLimitOrderConfig, tif});
                }

                else if (orderType === 'MOC') {
                    const marketCloseOrderConfig = ibInstance.order.marketClose(type, quantity);
                    this.placeOrderInternal(orderId, ibStock, {...marketCloseOrderConfig, tif});
                }
                
                else {
                    throw new Error('Invalid orderType');
                }
            })
            .then(() => {
                resolve(true);
            })
            .catch (err => {
                console.log(err.message);
                reject(err);
            })
        });
    }

    static cancelOrder(orderId) {
        return new Promise((resolve, reject) => {
            try {
                initalizeCallBack(orderId, resolve, reject);
                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                ibInstance.cancelOrder(orderId)
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
                ibInstance.reqOpenOrders()
                .then(() => {
                    resolve();    
                })
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
    clientId: serverPort,
    host: config.get('ib_tws_host'),
    port: config.get('ib_tws_port')
})

//Connest to IB server
InteractiveBroker.connect()

/**
 * Handling event 'orderStatus' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld) => {
    console.log("Event - OrderStatus: ", orderId);

    const orderStatusEvent = {orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld};
    return BrokerRedisController.addInteractiveBrokerEvent(orderStatusEvent, 'orderStatus');
});

/**
 * Handling event 'orderStatus' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('openOrder', (orderId, contract, order, orderState) => {
    console.log("Event - OpenOrder: ", orderId);

    return BrokerRedisController.addInteractiveBrokerEvent({orderId, order, orderState}, 'openOrder')
    .then(() => {
        var resolve = _.get(promises, `${orderId}.resolve`, null);
        if (resolve) {
            delete promises[reqId];
            resolve({orderId, contract, order, orderState});
        }
    })
});

/**
 * Handling event 'execDetails' when send from the IB gateway or IB TWS
 */
InteractiveBroker.interactiveBroker.on('execDetails', (requestId, contract, execution) => {
    console.log('Event - execDetails: ', requestId);
    const orderId = _.get(execution, 'orderId', null);
    return BrokerRedisController.addInteractiveBrokerEvent({orderId, execution}, 'execDetails');
});


InteractiveBroker.interactiveBroker.on('historicalData', (reqId, datetime, open, high, low, close, volume) => {
    const hasFinised = datetime.indexOf('finished') > -1;
    if (hasFinised) {
        return BrokerRedisController.getHistoricalData(reqId)
        .then(historicalData => {
            var resolve = _.get(promises, `${reqId}.resolve`, null);
            if (resolve) {
                delete promises[reqId];
                resolve(historicalData);
            } 
        });
    } else {
        return BrokerRedisController.addHistoricalData(reqId, {datetime, open, high, low, close, volume});
    }
});

InteractiveBroker.interactiveBroker.on('error', (errMsg, data) => {
    const reqId = _.get(data, 'id', null);
    if (reqId) {
        var reject = _.get(promises, `${reqId}.reject`, null);
        if(reject) {
            delete promises[reqId];
            reject(new Error(errMsg));
        }
    }

});


InteractiveBroker.interactiveBroker.on('connected', () => {
    isConnected = true
    console.log('Connected to interactive broker');
})

InteractiveBroker.interactiveBroker.on('disconnected', () => {
    isConnected = false;
    console.log('Disconnected');
    setTimeout(function() {
        console.log("Reconnecting");
        InteractiveBroker.interactiveBroker.connect()}, 5000);
})

InteractiveBroker.interactiveBroker.on('nextValidId', (reqId)  => {
    console.log('Next Valid Id:', reqId);
    return InteractiveBroker.interactiveBroker.setNextValidId(reqId)
    .then(() => {
        return InteractiveBroker.interactiveBroker.getExecutionsAndOpenOrders();
    })
})


if (config.get('node_ib_event_port') == serverPort) {
    //Process IB events only when market is open (only on single port)
    schedule.scheduleJob("*/1 * * * 1-5", function() {
        if (DateHelper.isMarketTrading()) {
            return BrokerRedisController.processIBEvents();
        }
    });
}

module.exports = InteractiveBroker;
