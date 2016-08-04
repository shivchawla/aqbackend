'use strict';
const UserModel = require('../models/user');
const jwtUtil = require('../utils/jwttoken');

exports.logoutUser = function(args, res, next) {
    /**
     * parameters expected in the args:
     **/
    // no response value expected for this operation
    res.end();
};

/*
 *  need to hash password
 */
exports.regiteruser = function(args, res, next) {
    const user = {
        email: args.body.value.email,
        firstName: args.body.value.firstName,
        lastName: args.body.value.lastName,
        password: args.body.value.password
    };
    UserModel.saveUser(user)
      .then(function(userDetails) {
          res.status(200).json(userDetails);
      })
      .catch(err => {
          next(err);
      });
};

exports.userlogin = function(args, res, next) {
    /**
     * parameters expected in the args:
     * body (Login)
     **/
    // no response value expected for this operation
    res.end();
};
