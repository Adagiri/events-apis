const LoginSession = require('../../models/LoginSession');

const deleteLoginSession = async (deviceToken, deviceType) => {
  await LoginSession.findOneAndDelete({
    platform: deviceType,
    deviceToken,
  });
};

const handleLoginSession = async (user, deviceType) => {
  const userId = user._id;

  const newSession = {
    user: userId,
    platform: deviceType,
  };

  newSession.deviceToken =
    deviceType === 'ANDROID'
      ? user.androidPushNotifToken
      : user.iosPushNotifToken;

  await deleteLoginSession(newSession.deviceToken, deviceType);

  await LoginSession.create(newSession);
};

module.exports = {
  deleteLoginSession,
  handleLoginSession,
};
