const { combineResolvers } = require('graphql-resolvers');
const {
  deleteAccount,
  editUserProfile,
  changePassword,
  editEventSetting,
  sendCodeForChangingEmail,
  verifyCodeForChangingEmail,
  editNotification,
  savePushNotificationToken,
  updateIosAppVersion,
} = require('../controllers/settings');
const { protect, authorize } = require('../middleware/auth');

module.exports = {
  Mutation: {
    settings_savePushNotificationToken: combineResolvers(
      protect,
      savePushNotificationToken
    ),
    settings_editProfile: combineResolvers(protect, editUserProfile),
    settings_editEvent: combineResolvers(protect, editEventSetting),
    settings_changePassword: combineResolvers(protect, changePassword),
    settings_changeEmail_sendCode: combineResolvers(
      protect,
      sendCodeForChangingEmail
    ),
    settings_changeEmail_verifyEmail: combineResolvers(
      protect,
      verifyCodeForChangingEmail
    ),
    settings_deleteAccount: combineResolvers(protect, deleteAccount),
    settings_editNotification: combineResolvers(protect, editNotification),
    settings_updateIosAppVersion: combineResolvers(
      protect,
      updateIosAppVersion
    ),
  },
};
