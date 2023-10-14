const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const {
  sendRoutineMessagesAndEmailsForEvent,
  handleEventReminders,
  handleEventRepeat,
} = require('./controllers/webhooks');
const {
  decodeAppStoreNotificationPayload,
  verifyAndGetAppStoreTransactions,
  handleVerifiedAppStoreNotification,
} = require('./services/AppleService');

const aws_secretKey = process.env.AWS_SECRET_KEY;

const app = express();
const allowedOrigins = [
  'http://localhost:3000',
  'https://studio.apollographql.com',
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.TEST_ENV === 'false'
        ? undefined // Allow Helmet to set appropriate CSP headers
        : false,
  })
);
app.use(express.json());
app.use('/assets', express.static('templates/assets'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.get('/', async (req, res) => {
  res.send(`Hello world! Now: ` + new Date().toLocaleString());
});

app.post('/api/handle-event-reminders', async (req, res) => {
  // Compare key here
  try {
    if (req.headers['aws-secret-key'] === aws_secretKey) {
      await handleEventReminders();
      return res.sendStatus(200);
    } else {
      return res.sendStatus(403);
    }
  } catch (error) {
    console.log('Error occured whilst handling event reminders: ', error);
    return res.sendStatus(500).send(JSON.stringify(error));
  }
});

app.post('/api/handle-event-repeat', async (req, res) => {
  // Compare key here
  try {
    if (req.headers['aws-secret-key'] === aws_secretKey) {
      await handleEventRepeat();
      return res.sendStatus(200);
    } else {
      return res.sendStatus(403);
    }
  } catch (error) {
    console.log(error, 'error occured in handle-event-repeat webhook');
    return res.sendStatus(500).send(JSON.stringify(error));
  }
});

// Webhook
app.post('/api/apple-in-app-purchase-notification', async (req, res) => {
  try {
    const signedPayload = req.body.signedPayload;
    const [headerToken, payloadToken] = signedPayload.split('.');

    const header = await decodeAppStoreNotificationPayload(headerToken);
    const payload = await decodeAppStoreNotificationPayload(payloadToken);

    const notificationData = verifyAndGetAppStoreTransactions(
      JSON.parse(header),
      JSON.parse(payload)
    );

    if (notificationData.verificationPassed) {
      await handleVerifiedAppStoreNotification({
        notificationData,
        payload,
        res,
      });
    } else {
      res.sendStatus(403);
    }
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

// Webhook / Event routines
app.post('/api/send-routine-messages-and-emails-on-event-day', (req, res) => {
  // Compare key here
  if (req.headers['aws-secret-key'] === aws_secretKey) {
    sendRoutineMessagesAndEmailsForEvent();
    res.sendStatus(200);
  } else {
    res.sendStatus(403);
  }
});

module.exports = app;
