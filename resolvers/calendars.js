const { combineResolvers } = require('graphql-resolvers');
const {
  setAppleAccessToken,
  getAppleAccessToken,
  saveAppleCalendarEvents,
  setGoogleRefreshToken,
  importGoogleCalendarEvents,
} = require('../controllers/calendars.js');
const { protect } = require('../middleware/auth');

module.exports = {
  Query: {
    calendar_getAppleAccessToken: combineResolvers(
      protect,
      getAppleAccessToken
    ),
  },
  Mutation: {
    calendar_setAppleAccessToken: combineResolvers(
      protect,
      setAppleAccessToken
    ),
    calendar_saveAppleCalendarEvents: combineResolvers(
      protect,
      saveAppleCalendarEvents
    ),
    calendar_setGoogleRefreshToken: combineResolvers(
      protect,
      setGoogleRefreshToken
    ),
    calendar_importGoogleCalendarEvents: combineResolvers(
      protect,
      importGoogleCalendarEvents
    ),
  },
};
