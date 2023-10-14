const crypto = require('crypto');
const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { ErrorResponse, SuccessResponse } = require('../../utils/responses');

module.exports = asyncHandler(async (_, args) => {
  const verifyEmailToken = crypto
    .createHash('sha256')
    .update(args.token)
    .digest('hex');

  const user = await User.findOne({
    verifyEmailToken,
  });

  if (!user) {
    return new ErrorResponse(400, 'Registeration session expired.');
  }

  const emailTaken = await User.findOne({
    email: user.email,
    isSignupCompleted: true,
  });

  if (emailTaken) {
    return new ErrorResponse(400, 'Email taken.');
  }

  if (user.verifyEmailCode !== args.code) {
    return new ErrorResponse(400, 'Incorrect code.');
  }

  user.isEmailVerified = true;
  await user.save();

  return new SuccessResponse(200, true, null, args.token);
});
