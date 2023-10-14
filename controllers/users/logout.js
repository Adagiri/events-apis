const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { SuccessResponse } = require('../../utils/responses');
const { deleteLoginSession } = require('./utils');

module.exports = asyncHandler(async (_, args, context) => {
  const userId = context.user.id;
  const deviceType = args.deviceType;
  const user = await User.findById(userId);

  const deviceToken =
    deviceType === 'ANDROID'
      ? user.androidPushNotifToken
      : user.iosPushNotifToken;

  await deleteLoginSession(deviceToken, deviceType);

  return new SuccessResponse(200, true, user);
});
