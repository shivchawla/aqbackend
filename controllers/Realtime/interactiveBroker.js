
'use strict';
const _ = require('lodash');
const ib = require('ib');
const config = require('config');
const Promise = require('bluebird');
const serverPort = require('../../index').serverPort;

const BrokerRedisController = require('./brokerRedisControl');
const DateHelper = require('../../utils/Date');

const ibTickers = require('../../documents/ibTickers.json');
const indices = require('../../documents/indices.json');

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
                    return this.setNextValidId(reqId)
                    .then(() => {
                        return Promise.all([
                            this.getExecutionsAndOpenOrders(),
                            this.getIntradayStreamDataForIndices()
                        ])
                    })

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
    }

    static getExecutionsAndOpenOrders() {
        BrokerRedisController.getNextRequestId()
        .then(reqId => {
            const ibInstance = this.interactiveBroker;

            return  Promise.all([
                ibInstance.reqExecutions(reqId, {}),
                ibInstance.reqAllOpenOrders()
            ]);
        })
    }

     static getIntradayStreamDataForIndices() {
        const ticker = Object.keys(indices);
        return Promise.map(tickers, function(ticker) {
            this.requestIntradayStreamData(ticker);
        });
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

    static requestIntradayHistoricalData(stock) {
        return new Promise((resolve, reject) => {
            try {
                let requestId = null;
                let historicalData = [];

                // Getting the interactive broker instance
                const ibInstance = this.interactiveBroker;
                this.getNextRequestId()
                .then(reqId => {
                    requestId = reqId;
                    stock = this.getRequiredSymbol(stock);

                    const contract = ibInstance.contract.stock(stock, 'NSE', 'INR');

                    ibInstance.reqHistoricalData(reqId, contract, '', '1 D', '1 min', 'TRADES', 1, 1, false)
                    .on('historicalData', (reqId, datetime, open, high, low, close, volume) => {
                        if (reqId === requestId) {
                            const hasFinised = datetime.indexOf('finished') > -1;
                            if (hasFinised) {
                                resolve(historicalData);
                            } else {
                                historicalData.push({datetime, open, high, low, close, volume});
                            }
                        }
                    })
                    .on('error', err => {
                        resolve([]);
                        console.log(err);
                    })
                })
            } catch (err) {
                reject(err);
            }
        })
    }

     static requestIntradayStreamData(stock, index = true) {
        try {
            let requestId = null;

            // Getting the interactive broker instance
            const ibInstance = this.interactiveBroker;
            this.getNextRequestId()
            .then(reqId => {
                requestId = reqId;
                
                let ibTicker = this.getRequiredSymbol(stock);

                let contract;
                if (index) {
                    contract = ibInstance.contract.stock(ibTicker, 'NSE', 'INR');
                } else {
                    contract = ibInstance.contract.ind(ibTicker, 'NSE', 'INR');    
                }

                ibInstance.reqHistoricalData(reqId, contract, '', '1 D', '1 min', 'TRADES', 1, 1, true)
                .on('historicalData', (reqId, datetime, open, high, low, close, volume) => {
                    if (reqId === requestId) {
                        BrokerRedisController.addLatestBarData(stock, {datetime, open, high, low, close, volume});
                    }
                })
                .on('historicalDataUpdate', (reqId, datetime, open, high, low, close, volume) => {
                    if (reqId === requestId) {
                        BrokerRedisController.addLatestBarData(stock, {datetime, open, high, low, close, volume});                           
                    }
                })
                .on('error', err => {
                    console.log(err);
                })
            })
        } catch (err) {
            reject(err);
        }
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
                let goodAfterTime = DateHelper.getMarketCloseDateTime().subtract(5, 'minutes').format('YYYYMMDD HH:mm:ss');
                let marketCloseOrderConfig = ibInstance.order.market(type, quantity, true, goodAfterTime);
                ibInstance.placeOrder(orderIds[0], ibStock, {...marketCloseOrderConfig, tif});
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
                ibInstance.placeOrder(orderIds[0], ibStock, marketIfTouchedOrderConfig);
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

    static modifyOrder({
        orderId,
        stock, 
        type = 'BUY', 
        quantity = 0, 
        price = 0, 
        orderType = 'market',
        tif="GTC",
    }) {
        const ibInstance = this.interactiveBroker;

        // creating IB stock from the stock param passed
        const ibStock = ibInstance.contract.stock(stock, 'NSE', 'INR');

        return Promise.resolve()
        .then(() => {
            if (!isConnected) {
                throw new Error("Not connected");
            }

            if (orderType === 'LMT') {
                const limitOrderConfig = ibInstance.order.limit(type, quantity, price);
                ibInstance.placeOrder(orderId, ibStock, {...limitOrderConfig, tif});
            } 
            
            else if (orderType === 'MKT') {
                const marketOrderConfig = ibInstance.order.market(type, quantity);
                ibInstance.placeOrder(orderId, ibStock, {...marketOrderConfig, tif});
            }

            else if (orderType === 'STP') {
                const stopLimitOrderConfig = ibInstance.order.stopLimit(type, quantity, price);
                ibInstance.placeOrder(orderId, ibStock, {...stopLimitOrderConfig, tif});
            }

            else if (orderType === 'MOC') {
                const marketCloseOrderConfig = ibInstance.order.marketClose(type, quantity);
                ibInstance.placeOrder(orderId, ibStock, {...marketCloseOrderConfig, tif});
            }
            
            else {
                throw new Error('Invalid orderType');
            }
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

if (config.get('node_ib_port') === serverPort && config.get('ib_connect_flag')) {

    /**
     * Initializing interactive broker instance to the required config,
     * basic handling of errors and result
     */
    InteractiveBroker.interactiveBroker = new ib({
        clientId: 0,
        host: config.get('ib_tws_host'),
        port: config.get('ib_tws_port')
    })

    //Connest to IB server
    InteractiveBroker.connect()

    /**
     * Handling event 'orderStatus' when send from the IB gateway or IB TWS
     */
    InteractiveBroker.interactiveBroker.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld) => {
        // console.log('Event - orderStatus', status);
        console.log("Event - OrderStatus: ", orderId);

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
        console.log("Event - OpenOrder: ", orderId);

        BrokerRedisController.addInteractiveBrokerEvent({orderId, order, orderState}, 'openOrder');

        // BrokerRedisController.updateOpenOrder(orderId, {order, orderState});
    });

    /**
     * Handling event 'execDetails' when send from the IB gateway or IB TWS
     */
    InteractiveBroker.interactiveBroker.on('execDetails', (requestId, contract, execution) => {
        console.log('Event - execDetails');
        const orderId = _.get(execution, 'orderId', null);
        // console.log("ExecDetails: ", orderId);
        BrokerRedisController.addInteractiveBrokerEvent({orderId, execution}, 'execDetails');
    });

}


module.exports = InteractiveBroker;



