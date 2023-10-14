const { messaging } = require('firebase-admin');
const { default: axios } = require('axios');

const BREVO_API_KEY = process.env.BREVO_API_KEY;

const createEmailParam = (from, to, subject, message) => {
  var payload = {};

  payload.sender = {
    name: 'AnyEvent',
    email: 'hello@anyevent.app',
  };

  payload.replyTo = {
    name: 'AnyEvent',
    email: 'no-reply@anyeventlite.app',
  };

  payload.subject = subject;
  payload.htmlContent = message;

  payload.messageVersions = to.map((email) => {
    return {
      to: [
        {
          email: email,
        },
      ],
      htmlContent: message,
      subject: subject,
    };
  });

  return payload;
};

const createCustomEmailParam = (recipients) => {
  var payload = {};

  payload.sender = {
    name: 'AnyEvent',
    email: 'hello@anyevent.app',
  };

  payload.replyTo = {
    name: 'AnyEvent',
    email: 'no-reply@anyeventlite.app',
  };

  payload.subject = 'Events';
  payload.htmlContent =
    '<!DOCTYPE html><html><body><h1>Events</h1><p>Hello from Event App</p></body></html>';

  payload.messageVersions = recipients.map((recipient) => {
    return {
      to: [
        {
          email: recipient.email,
        },
      ],
      htmlContent: recipient.body,
      subject: recipient.subject,
    };
  });

  return payload;
};

const sendEmail = async (payload) => {
  const headers = {
    'api-key': BREVO_API_KEY,
    'content-type': 'application/json',
    accept: 'application/json',
  };

  await axios.post(`https://api.brevo.com/v3/smtp/email`, payload, {
    headers,
  });
};

const sendPushNotifications = async (messages) => {
  messaging()
    .sendAll(messages)
    .then((response) => {
      console.log(response.successCount + ' messages were sent successfully');
    })
    .catch((error) => {
      console.log('error:', error);
    });
};

module.exports = {
  sendEmail,
  createEmailParam,
  createCustomEmailParam,
  sendPushNotifications,
};
