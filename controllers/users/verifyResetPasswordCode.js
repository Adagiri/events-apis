const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { ErrorResponse, SuccessResponse } = require('../../utils/responses');


module.exports = asyncHandler(async (_, args) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(args.token)
    .digest('hex');

  const existingUser = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!existingUser) {
    return new ErrorResponse(400, 'Invalid token');
  }

  if (existingUser.resetPasswordCode !== args.code) {
    return new ErrorResponse(400, 'Incorrect code');
  }

  existingUser.isResetPasswordCodeVerified = true;
  await existingUser.save();

  return new SuccessResponse(200, true, null, args.token);
});
