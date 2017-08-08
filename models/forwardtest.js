'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const ForwardTest = new Schema({
    strategy: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Strategy',
    },

    backtest: {
        type: Schema.Types.ObjectId,
        require: true,
        ref: 'Backtest',
    },

    code: {
        type: String,
        require: true,
    },

    active: {
        type: Boolean,
        default: true
    },

    error: {
        type: Boolean,
        defaut: false,
    },

    deleted: {
        type: Boolean,
        default: false
    },

    name: {
        type: String,
        require: false
    },

    output: Schema.Types.Mixed,

    serializedData: Schema.Types.Mixed,

    createdAt: Date,

    updatedAt: Date
});

ForwardTest.statics.saveForwardTest = function(backtestDetails) {
    const backtest = new this(backtestDetails);
    return backtest.saveAsync();
};

ForwardTest.statics.fetchForwardTest = function(query, options) {
    var q = this.findOne(query);

    if(options.select) {
        options.select = options.select.replace(',', ' ');
        q = q.select(options.select);
    }

    return q.populate('strategy', 'user name').execAsync();
};

ForwardTest.statics.fetchForwardTests = function(query, options) {
    //var project = { strategy : 1,code : 1, status : 1, createdAt : 1,settings :1, 'output.summary' : 1} ;
    var q = this.find(query);

    if (!options.select) {
        options.select = 'strategy code status createdAt settings output.summary';
    } else {
        options.select = options.select.replace(',',' ');
    }

    q = q.select(options.select);

    if(options.skip) {
        q = q.skip(options.skip);
    } 

    if(options.limit) {
        q = q.limit(options.limit);
    }   

    if(options.sort) {
        options.sort = options.sort.replace(',',' ');
        q = q.sort(options.sort);
    }

    return q.populate('strategy','user').execAsync();
};

ForwardTest.statics.findCount = function(query) {
    return this.countAsync(query);
};

ForwardTest.statics.removeAllBack = function(query) {
    return this.removeAsync(query);
};

ForwardTest.statics.updateForwardTest = function(query, updates) {
    return this.update(query, updates)
        .then(forwardtest => {
            if (forwardtest) {
                return ({forwardtestId: forwardtest._id, message:"Successfully updated"});
            }
        })
        .catch(err => {
            console.log("ForwardTest not found");
            console.log(err);
        });
};

const ForwardtestModel = mongoose.model('ForwardTest', ForwardTest, 'forwardtests');
module.exports = ForwardtestModel;
