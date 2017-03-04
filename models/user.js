'use strict';
const mongoose = require('./index');
const Schema = mongoose.Schema;
const User = new Schema({    

    email: {
        type: String,
        require: true,
        index: true,
        unique: true
    },
    firstName: {
        type: String,
        require: true
    },
    lastName: {
        type: String,
        require: true
    },
    photourl: {
        type: String
    },
    country: {
        type: String
    },
    password: {
        type: String,
        require: true
    },
    active: {
        type: Boolean,
        default: false,
        require: true
    },
    code: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        //required: true,
    },
    updatedAt: Date,

    investor: {
        type: Schema.Types.ObjectId,
        ref: 'Investor'
    },
    
    advisor: {
        type: Schema.Types.ObjectId,
        ref: 'Advisor'
    },

    isInvestor: {
        type: Boolean
    },

    isAdvisor: { 
        type: Boolean,
    },

});

User.index({
    email: 1
}, {
    unique: true
});

User.statics.saveUser = function(userDetails) {
    const user = new this(userDetails);
    return user.save();
};

User.statics.fetchUser = function(query) {
    return this.findOne(query).execAsync();
};

User.statics.updateStatus = function(query, status) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                user.active = status;
                return user.save();
            }
        });
};

User.statics.updateAdvisor = function(query, advisorId) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                console.log(user);
                user.advisor = advisorId;
                user.isAdvisor = true;
                return user.save();
            }
        });
};

User.statics.updateInvestor = function(query, investorId) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                console.log(user);
                user.investor = investorId;
                user.isInvestor = true;
                console.log(user);
                return user.save();
            }
        });
};

User.statics.updateCode = function(query, code) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                user.code = code;
                return user.save();
            }
        });
};

User.statics.updatePassword = function(query, hash) {
    return this.findOne(query)
        .then(function(user) {
            if (user) {
                user.password = hash;
                return user.save();
            }
        });
};

const userModel = mongoose.model('User', User, 'users');
module.exports = userModel;
