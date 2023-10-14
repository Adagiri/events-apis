const { default: axios } = require('axios');
const admin = require('firebase-admin');
const fs = require('fs').promises;
const { retrieveFile } = require('./AwsService');
const { ErrorResponse } = require('../utils/responses');
const User = require('../models/User');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const GOOGLE_CALENDAR_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const GOOGLE_CALENDAR_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const GOOGLE_CALENDAR_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_CONSENT_SCREEN_REDIRECT_URI;

module.exports.initializeFirebaseAdmin = async () => {
  const serviceAccount = await getFirebaseAdminConfig();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
};

const getFirebaseAdminConfig = async () => {
  let config = null;
  try {
    const fileString = await fs.readFile(
      'config/firebase_admin_config.json',
      'utf8'
    );
    config = JSON.parse(fileString);
  } catch (error) {
    const fileResponse = await retrieveFile(
      'events-app-firebase-admin-sdk-config.json',
      'events-app-secrets'
    );
    const buffer = fileResponse.Body;
    const fileString = buffer.toString('utf8');
    config = JSON.parse(fileString);
    await saveFirebaseAdminConfig(fileString);
  }
  return config;
};

const saveFirebaseAdminConfig = async (fileString) => {
  try {
    await fs.writeFile('config/firebase_admin_config.json', fileString);
  } catch (error) {
    console.log(error, 'error occured whilst saving config file');
  }
};

const createDeepLink = async (resourceId) => {
  const domainUriPrefix = 'https://invitations.tryevent.app';

  const payload = {
    dynamicLinkInfo: {
      domainUriPrefix: domainUriPrefix,
      link: `https://tryevent.app/invitations/?type=events&resourceId=${resourceId}`,
      iosInfo: {
        iosBundleId: 'app.eventapp.event',
      },
    },
  };

  try {
    const resp = await axios.post(
      `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${FIREBASE_API_KEY}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );


    const [_, inviteLink] = resp.data.shortLink.split(`${domainUriPrefix}/`);

    return inviteLink;
  } catch (error) {
    console.log(
      error.response.data.error,
      'error whilst trying to create deep link'
    );
  }
};

const getCalendarAuthTokens = async (code) => {
  const authorizationCode = code;

  try {
    const response = axios.post('https://oauth2.googleapis.com/token', {
      code: authorizationCode,
      client_id: GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: GOOGLE_CALENDAR_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALENDAR_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    return {
      accessToken,
      refreshToken,
    };
  } catch (error) {
    console.error('Error requesting tokens:', error);
    throw new ErrorResponse(500, 'Error, please try again.');
  }
};

const refreshCalendarAccessToken = async (refreshToken, userId) => {
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: GOOGLE_CALENDAR_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const accessToken = response.data.access_token;
    return accessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error.response.data);
    const errorBody = error.response?.data;

    // Refresh token has become invalid
    if (errorBody.error === 'invalid_grant') {
      await User.findByIdAndUpdate(userId, {
        googleCalendarApiRefreshToken: null,
        isGoogleCalendarApiAuthorized: false,
      });

      throw new ErrorResponse(
        403,
        'Access denied. Please grant the necessary perminssions for us to access your google calendar events.'
      );
    }
    throw error;
  }
};

const getGoogleCalendarEvents = async (refreshToken, userId) => {
  const accessToken = await refreshCalendarAccessToken(refreshToken, userId);

  try {
    const response = await axios.get(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const events = response.data.items;

    return events;
  } catch (error) {
    console.error('Error fetching calendars:', error.response.data);
    throw new ErrorResponse(500, 'Error, please try again.');
  }
};

module.exports.getGoogleCalendarEvents = getGoogleCalendarEvents;
module.exports.getCalendarAuthTokens = getCalendarAuthTokens;
module.exports.getFirebaseAdminConfig = getFirebaseAdminConfig;
module.exports.createDeepLink = createDeepLink;
