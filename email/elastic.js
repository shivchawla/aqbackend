const axios = require('axios');
const config = require('config');
const _ = require('lodash');

// const message = {
//     to: [{
//         email: 'saru.sreyo@gmail.com',
//         name:'Saurav Biswas'
//     },
//     {
//         email: 'sauravbiswas16294@gmail.com',
//         name:'Ravi Biswas'
//     }],
//     from: senderDetails,
//     templateId: activationTemplateId,
//     substitutions: {
//         userFullName: 'Saurav Biswas',
//         activationUrl: eval('`' + config.get(`account_activation_api_url.${src}`) + '`'),
//     },
// };

// // console.log('Message ', msg);

module.exports.sendElasticEmail = (res = null, msg, obj) => {
    const elasticEmailApiKey = config.get('elasticemail_key');
    let to = _.get(msg, 'to', []);
    to = to.map(msgItem => {
        return msgItem.email;
    });
    to = to.join(';');

    const substitutions = _.get(msg, 'substitutions', {});
    let substitutionString = [];
    Object.keys(substitutions).map(substitutionKey => {
        substitutionString.push(`merge_${substitutionKey}=${substitutions[substitutionKey]}`);
    })
    substitutionString = substitutionString.join('&');
    
    const from = _.get(msg, 'from.email', 'contest@adviceqube.com');
    const fromName = _.get(msg, 'from.name', 'AdviceQube');
    const template = _.get(msg, 'templateId', '');
    const isTransactional = true;

    const url = `https://api.elasticemail.com/v2/email/send?apikey=${elasticEmailApiKey}&isTransactional=${isTransactional}&from=${from}&fromName=${fromName}&to=${to}&template=${template}&${substitutionString}`;
    
    return axios({
        method: 'POST',
        url
    })
    .then(() => {
        if (res !== null) {
            if (obj && obj.redirectUrl) {
                res ? res.redirect(obj.redirectUrl) : {};
            }
     
            if (obj) {
                return res ? res.send(obj) : {};
            }
    
            return res ? res.status(200).send("Email Sent") : {}; 
        } else {
            return null;
        }
    })
    .catch(error => {
        //Log friendly error
        console.error(error.toString());
        if (res !== null) {
            return res ? res.status(400).send('There was an error sending the email') : {};
        }
    });
}

// https://api.elasticemail.com/v2/email/send?apikey=9053bb8a-90c8-4b4a-959f-ae5401b86ed5 
// &from=contest@adviceqube.com&fromName=AdviceQube&to=sauravbiswas16294@gmail.com&subject=Allocation worth Rs. 10 Lacs awarded: AdviceQube
// &template=Test TEmpalte&merge_userFullName=Saurav Biswas