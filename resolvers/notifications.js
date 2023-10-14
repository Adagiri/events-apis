const { combineResolvers } = require('graphql-resolvers');
const {
  getNotifications,
  markNotificationAsClicked,
  markNotificationAction,
  getNewNotificationCount,
  getUnreadNotificationCount,
} = require('../controllers/notifications');
const { protect, authorize } = require('../middleware/auth');

module.exports = {
  Query: {
    notifications: combineResolvers(protect, getNotifications),
    notification_newCount: combineResolvers(protect, getNewNotificationCount),
    notification_getUnreadCount: combineResolvers(
      protect,
      getUnreadNotificationCount
    ),
  },

  Mutation: {
    notification_markAction: combineResolvers(protect, markNotificationAction),
    notification_markAsClicked: combineResolvers(
      protect,
      markNotificationAsClicked
    ),
  },
};
