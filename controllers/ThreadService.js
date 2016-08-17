'use strict';

exports.createThread = function(args, res, next) {
    res.end();
}

exports.followThread = function(args, res, next) {
    res.end();
}

exports.likeThread = function(args, res, next) {
  /**
   * parameters expected in the args:
  * threadId (String)
  * body (UserId)
  **/
  // no response value expected for this operation
  res.end();
}

exports.replyToThread = function(args, res, next) {
  /**
   * parameters expected in the args:
  * threadId (String)
  * body (Thread)
  **/
  // no response value expected for this operation
  res.end();
}

exports.viewThread = function(args, res, next) {
  /**
   * parameters expected in the args:
  * threadId (String)
  * body (UserId)
  **/
  // no response value expected for this operation
  res.end();
}
