const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { getConfig } = require('../../services/GoogleService');
const { ErrorResponse, SuccessResponse } = require('../../utils/responses');
const { handleLoginSession } = require('./utils');

module.exports = asyncHandler(async (_, args) => {
  const user = await User.findOne({
    email: args.email,
  }).select('+password');

  if (!user) {
    return new ErrorResponse(400, 'Invalid credentials');
  }

  const isPasswordMatch = await user.comfirmPassword(args.password);

  if (!isPasswordMatch) {
    return new ErrorResponse(400, 'Invalid credentials');
  }

  await handleLoginSession(user, args.deviceType);

  const token = user.getSignedJwtToken();
  return new SuccessResponse(200, true, user, token);
});