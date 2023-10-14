const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
let apiInstance = new SibApiV3Sdk.TransactionalSMSApi();
let sendTransacSms = new SibApiV3Sdk.SendTransacSms();

let apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.SENDINBLUE_SMS_API_KEY;

const sendSMS = async (payload) => {
  // sms payload
  sendTransacSms = { ...payload };
  // send sms
  let result = await apiInstance.sendTransacSms(sendTransacSms);
};

module.exports = sendSMS