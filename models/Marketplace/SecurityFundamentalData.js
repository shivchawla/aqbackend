'use strict';
const mongoose = require('../index');
const Schema = mongoose.Schema;

const Security = require('./Security');
const SecurityFundametalData = new Schema({
    security: Security,

    fundamentalData: {
        updatedDate: Date,
        detail: Schema.Types.Mixed
    }
});

SecurityFundametalData.index({'security.ticker': 1}, {unique: true});

SecurityFundametalData.index({
    'security.ticker': 'text',
    'security.name': 'text',
    'security.detail.NSE_Name': 'text'
});

SecurityFundametalData.statics.saveSecurityFundamentalData = function(saveSecurityFundamentalData) {
    const fd = new this(saveSecurityFundamentalData);
    return fd.save();
};

SecurityFundametalData.statics.fetchSecurityFundamentalData = function(query, options) {
	return this.findOne(query)
	.select(options.fields)
	.execAsync();
};

SecurityFundametalData.statics.updateFundamentalData = function(query, fundamentalData) {
    var updates = {fundamentalData: {detail: fundamentalData, updatedDate: new Date()}};
	return this.findOneAndUpdate(query, {$set: updates}, {fields: 'security fundamentalData', new:true});
};

SecurityFundametalData.statics.fetchFundamentalData = function(query) {
	return this.findOne(query)
	.select('fundamentalData security')
	.execAsync();
};

const SecurityFundamentalDataModel = mongoose.model('SecurityFundamentalData', SecurityFundametalData);
module.exports = SecurityFundamentalDataModel