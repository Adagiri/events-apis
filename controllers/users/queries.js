const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { ErrorResponse } = require('../../utils/responses');

module.exports.getSubscriptionInfo = asyncHandler(async (_, args, context) => {
  const user = await User.findById(context.user.id).select('subscriptionInfo');

  return user.subscriptionInfo;
});

module.exports.getLoggedInUser = asyncHandler(async (_, args, context) => {
  const user = await User.findById(context.user.id);
  user.id = user._id;
  return user;
});

module.exports.getUserById = asyncHandler(async (_, args) => {
  const user = await User.findById(args.id);

  if (!user) {
    throw new ErrorResponse(404, 'User not found');
  }

  user.id = user._id;
  return user;
});
