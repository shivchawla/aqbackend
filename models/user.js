const mongoose = require('./index');
const Schema = mongoose.Schema;
const User = new Schema({
    email: {
        type: String,
        require: true
    },
    firstname: {
        type: String,
        require: true
    },
    lastname: {
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
        require: true
    },
    createAt: Date,
    updatedAt: Date
});

User.statics.saveUser = function(userDetails) {
    const user = new this(userDetails);
    return user.save();
};

User.statics.fetchUser = function(query) {
    return this.findOne(query);
};

User.statics.updateUser = function(userDetails) {
    return this.findOne({
        id: userDetails.id
    }).then(function(user) {
        if (user) {
            user.active = true;
            return user.save();
        }
    });
};

module.exports = mongoose.model('User', User, 'user');
