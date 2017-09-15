'use strict';
const HelperModels = require("./common");
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Backtest = new Schema({
    strategy: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Strategy'
    },
    settings: {
        type: Schema.Types.Mixed,
        require: true,
    },

    notes :{
        type: String,
        require: false, 
    },  

    name: {
        type: String,
        require: false
    },
    strategy_name: {
        type: String,
        require: false
    },
    code: {
        type: String,
        require: false
    },
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
    },

    realtimeOutput: Schema.Types.Mixed,

    createdAt: Date,
    updatedAt: Date
});

Backtest.statics.saveBacktest = function(backtestDetails) {
    const backtest = new this(backtestDetails);
    return backtest.saveAsync();
};

Backtest.statics.fetchBacktest = function(query, options) {
    var q = this.findOne(query);

    if(options.select) {
        var select = options.select.replace(',', ' ');
        select = select.replace('performance', 'output.performance');
        select = select.replace('logs', 'output.logs');
        select = select.replace('portfolioHistory', 'output.portfolioHistory');
        select = select.replace('transactionHistory', 'output.transactionHistory');
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
    return this.removeAsync(query);
};

Backtest.statics.updateBacktest = function(query, updates) {
    
    var fupdates = updates.output ? _formatUpdates(updates) : updates;

    Promise.all([
        HelperModels.LogModel.saveLogs(fupdates.output ? fupdates.output.logs : null),
        HelperModels.PerformanceModel.savePerformance(fupdates.output ? fupdates.output.performance : null),
        HelperModels.TransactionHistoryModel.saveTransactionHistory(fupdates.output ? fupdates.output.transactionHistory : null),
        HelperModels.PortfolioHistoryModel.savePortfolioHistory(fupdates.output ? fupdates.output.portfolioHistory : null)])
    .then(([logId, performanceId, thId, phIds]) => {
        
        //update values with ids
        if(fupdates.output) {
            fupdates.output.logs = logId;
            fupdates.output.performance = performanceId;
            fupdates.output.transactionHistory = thId;
            fupdates.output.portfolioHistory = phIds;
        }

        return this.update(query, fupdates);
    }).then(backtest => {
        if (backtest) {
            //return ({backtestId: backtest._id, message:"Backtest Successfully updated"}); 
            return ({message:"Backtest Successfully updated"}); 
        } else {
            throw new Error("Not updated or not found");
        } 
    })
    .catch(err => {
        console.log(err);
    });
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
                } else if (o_key == "transactions") {
                    foutput["transactionHistory"] = output["transactions"];
                } else if (["logs","summary", "totalreturn", "detail"].indexOf(o_key) != -1) {
                    foutput[o_key] = output[o_key];
                } else {
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
