const { addDays } = require('date-fns');
const asyncHandler = require('../middleware/async');
const User = require('../models/User');
const { SuccessResponse, ErrorResponse } = require('../utils/responses');

// @desc Activate free trial
// @type QUERY
// @access Private

module.exports.activateFreeTrial = asyncHandler(async (_, args, context) => {
  const userId = context.user.id;

  const user = await User.findById(userId);
  const subscriptionInfo = user.subscriptionInfo;

  if (subscriptionInfo.hasUsedFreeTrial) {
    return new ErrorResponse(400, 'You have already used your free trial');
  } else {
    user.subscriptionInfo.hasUsedFreeTrial = true;
    user.subscriptionInfo.isFreeTrialActive = true;
    user.subscriptionInfo.freeTrialExpiryDate = addDays(new Date(), 7);

    await user.save();

    user.id = user._id;
    return new SuccessResponse(200, true, user);
  }
});
