'use strict';
const HelperModels = require("./common");
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Backtest = new Schema({
    strategy: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Strategy'
    },
    settings: {
        type: Schema.Types.Mixed,
        required: true,
    },

    notes :{
        type: String,
        required: false, 
    },  

    name: {
        type: String,
        required: false
    },
    strategy_name: {
        type: String,
        required: false
    },
    code: {
        type: String,
        required: false
    },

    type: {
        type: String,
        required: true,
    },

    entryConditions: [{
        type: Schema.Types.Mixed,
        required: false
    }],

    exitConditions: [{
        type: Schema.Types.Mixed,
        required: false
    }],

    entryLogic: {type: String, required: false},
    exitLogic: {type: String, required: false},

    shared : {
        type : Boolean,
        require : false
    },
    deleted : {
        type : Boolean,
        require : false,
    },
    status: {
        type : String,
        require : false
    },

    output: {
        summary: Schema.Types.Mixed,

        totalreturn: Schema.Types.Mixed,

        logs: {
            type: Schema.Types.ObjectId,
            ref:'Logs',
        },

        performance: {
            type: Schema.Types.ObjectId,
            ref: 'Performance',
        },

        //Portfolio history is fragmented into 100 days section
        portfolioHistory: [{
            type: Schema.Types.ObjectId,
            ref: 'PortfolioHistory',
        }],

        transactionHistory: [{
            type: Schema.Types.ObjectId,
            ref: 'TransactionHistory',
        }],

        tradebook: {
            type: Schema.Types.ObjectId,
            ref: 'TradeBook'
        }
    },

    executionDetail: Schema.Types.Mixed,

    realtimeOutput: Schema.Types.Mixed,

    createdAt: Date,
    updatedAt: Date
});

Backtest.statics.saveBacktest = function(backtestDetails) {
    const backtest = new this(backtestDetails);
    return backtest.saveAsync();
};

Backtest.statics.fetchBacktest = function(query, options = {}) {
    var q = this.findOne(query);

    if(options.select) {
        var select = options.select.replace(',', ' ');
        select = select.replace('performance', 'output.performance');
        select = select.replace('logs', 'output.logs');
        select = select.replace('portfolioHistory', 'output.portfolioHistory');
        select = select.replace('transactionHistory', 'output.transactionHistory');
        select = select.replace('tradebook', 'output.tradebook');
        q = q.select(select); // 
    }

    //by default send only the performance (as defult output)
    if((options.select && options.select.indexOf(' output') != -1) || !options.select) {
        q = q.populate('output.performance');
    }

    if((options.select && options.select.indexOf('performance') != -1)) {
        q = q.populate('output.performance');
    }

    if((options.select && options.select.indexOf('logs') != -1)) {
        q = q.populate('output.logs');
    }

    if((options.select && options.select.indexOf('portfolioHistory') != -1)) {
        q = q.populate('output.portfolioHistory');
    }

    if((options.select && options.select.indexOf('transactionHistory') != -1)) {
        q = q.populate('output.transactionHistory');
    }

    if((options.select && options.select.indexOf('tradebook') != -1)) {
        q = q.populate('output.tradebook');
    }
  
    return q.populate('strategy', 'user').execAsync();

};

Backtest.statics.fetchBacktests = function(query, options) {
    //var project = { strategy : 1,code : 1, status : 1, createdAt : 1,settings :1, 'output.summary' : 1} ;
    if (!options.select) {
        options.select = 'strategy code status createdAt settings output.summary';
    } else {
        options.select = replace(options.select, ',',' ');
    }

    var q = this.find(query)
        .select(options.select)
        .skip(options.skip)
        .limit(options.limit);

    if(options.sort) {
        options.sort = options.sort.replace(',',' ');
        q = q.sort(options.sort);
    }

    return q.populate('strategy','user').execAsync();
};

Backtest.statics.findCount = function(query) {
    return this.countAsync(query);
};

Backtest.statics.removeAllBack = function(query) {
    var q = this.findOne(query)
    .select('output.performance output.logs output.portfolioHistory output.transactionHistory');

    return q.execAsync()
    .then(bt => {
        if(bt) {
            return Promise.all([
                HelperModels.LogModel.deleteLogs({_id: bt.output.logs}),
                HelperModels.PerformanceModel.deletePerformance({_id: bt.output.performance}),
                HelperModels.TransactionHistoryModel.deleteTransactionHistory({_id: {$in: bt.output.transactionHistory}}),
                HelperModels.PortfolioHistoryModel.deletePortfolioHistory({_id: {$in: bt.output.portfolioHistory}}),
                HelperModels.TradeBookModel.deleteTradeBook({_id: {$in: bt.output.tradebook}})]); 
        } else {
            return [{},{},{},{},{}];
        } 
    })
    .then(([d1, d2, d3, d4, d5]) => {
        return this.removeAsync(query);
    })
    .catch(err => {
        console.log(err);
        console.log("Error deleting Backtest");
    })   
};

Backtest.statics.updateBacktest = function(query, updates) {
    
    var fupdates = updates.output ? _formatUpdates(updates) : updates;

    return Promise.all([
        HelperModels.LogModel.saveLogs(fupdates.output ? fupdates.output.logs : null),
        HelperModels.PerformanceModel.savePerformance(fupdates.output ? fupdates.output.performance : null),
        HelperModels.TransactionHistoryModel.saveTransactionHistory(fupdates.output ? fupdates.output.transactionHistory : null),
        HelperModels.PortfolioHistoryModel.savePortfolioHistory(fupdates.output ? fupdates.output.portfolioHistory : null),
        HelperModels.TradeBookModel.saveTradeBook(fupdates.output ? fupdates.output.tradebook : null)])
    .then(([logId, performanceId, thId, phIds, tbId]) => {
        
        //update values with ids
        if(fupdates.output) {
            fupdates.output.logs = logId;
            fupdates.output.performance = performanceId;
            fupdates.output.transactionHistory = thId;
            fupdates.output.portfolioHistory = phIds;
            fupdates.output.tradebook = tbId;
        }

        return this.update(query, fupdates);
    })
    .then(status => {
        if(status && status.ok) {
            return true;
        } else {
            return false;
        }

    });
    /*.then(status => {
        if (status) {
            return ({message:"Backtest Successfully updated"}); 
        } else {
            return new Error("Not updated or not found");
        } 
    });*/
};

function _formatUpdates(updates) {
    var fupdates = {}; 
    
    Object.keys(updates).forEach(key => {
        if (key == "output") {
            var foutput = {};
            var output = updates["output"]; 
            Object.keys(output).forEach(o_key => {
                if(o_key == "account") {
                    foutput["portfolioHistory"] = output["account"];
                } 
                else if (o_key == "transactions") {
                    foutput["transactionHistory"] = output["transactions"];
                } 
                else if (o_key == "tradebook") {
                    foutput["tradebook"] = output["tradebook"]
                }  
                else if (["logs","summary", "totalreturn", "detail"].indexOf(o_key) != -1) {
                    foutput[o_key] = output[o_key];
                } 
                else {
                    if(!("performance" in foutput)) {
                        foutput["performance"] = {};    
                    }
                    foutput["performance"][o_key] = output[o_key]
                }  
            });

            fupdates["output"] = foutput;
        } else {
            fupdates[key] = updates[key];
        }
    });

    return fupdates
}

const backtestModel = mongoose.model('Backtest', Backtest, 'backtests');
module.exports = backtestModel;
