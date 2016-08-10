'use strict';
const config = require('config');
const mailer = require('express-mailer');
let appGbl;

module.exports.config = function(app) {
    appGbl = app;
    mailer.extend(app, config.get('mail'));
    app.set('views', __dirname + '/..' + '/views');
    app.set('view engine', 'jade');
};

module.exports.sendMail = function(res) {
    appGbl.mailer.send('activate', {
        // REQUIRED. This can be a comma delimited string just like a normal email to field.
        to: 'sudhirbitsgoa@gmail.com',
        subject: 'Test Email', // REQUIRED.
        // All additional properties are also passed to the template as local variables.
        firstName: 'ss',
        lastName: 'ss'
    }, function(err) {
        if (err) {
            // handle error
            // console.log(err);
            res.send('There was an error sending the email');
            return;
        }
        res.send('Email Sent');
    });
};
/**
app.mailer.send('email', {
    to: 'example@example.com', // REQUIRED. This can be a comma delimited string just like a normal email to field.
    subject: 'Test Email', // REQUIRED.
    otherProperty: 'Other Property' // All additional properties are also passed to the template as local variables.
  }, function (err) {
    if (err) {
      // handle error
      console.log(err);
      res.send('There was an error sending the email');
      return;
    }
    res.send('Email Sent');
  });
**/
