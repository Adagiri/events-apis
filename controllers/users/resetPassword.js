const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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

  if (!existingUser.isResetPasswordCodeVerified) {
    return new ErrorResponse(400, 'Reset password code not yet verified');
  }

  const salt = await bcrypt.genSalt(10);
  const password = await bcrypt.hash(args.password, salt);

  existingUser.password = password;
  existingUser.resetPasswordToken = undefined;
  existingUser.resetPasswordExpire = undefined;
  existingUser.resetPasswordCode = undefined;
  existingUser.isResetPasswordCodeVerified = undefined;
  await existingUser.save();

  return new SuccessResponse(200, true);
});
