'use strict';
const mongoose = require('./index');
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

    output: Schema.Types.Mixed,
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
        options.select.replace(',', ' ');
        q = q.select(options.select);
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
    return this.update(query, updates)
        .then(backtest => {
            if (backtest) {
                return ({backtestId: backtest._id, message:"Successfully updated"}); 
            } 
        })
        .catch(err => {
            console.log("Backtest not found");
            console.log(err);
        });
};

const backtestModel = mongoose.model('Backtest', Backtest, 'backtests');
module.exports = backtestModel;
