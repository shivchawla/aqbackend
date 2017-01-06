/**
 * Created by shubham on 6/1/17.
 */
var sendgrid = require('sendgrid')(sails.config.sendgrid_key);

var Email = {
    sendUserNotification: function (emailsToSend, ccEmail, bccEmail, subject, emailText, onDone) {

        var email = new sendgrid.Email();
        email.replyto = "contactus@zopky.com";
        email.setTos(emailsToSend);
        email.setFrom("contactus@zopky.com");
        email.setFromName("Zopky Travel");
        email.setCcs(ccEmail);
        email.setBccs(bccEmail);
        email.setSubject(subject);
        email.setHtml(emailText);
        email.setHeaders({
            "Reply-To": "contactus@zopky.com"
        });

        sendgrid.send(email, function (err, json) {
            if (err) {
                console.log("mail sent error : " + err);
                return onDone(err);
            }
            console.log("mail sent success : " + JSON.stringify(json));
            return onDone("Mail Sent!!!");
        });
    },
};
module.exports = Email;