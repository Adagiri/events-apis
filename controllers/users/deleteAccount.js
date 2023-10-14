const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { SuccessResponse } = require('../../utils/responses');
const Event = require('../../models/Event');

module.exports = asyncHandler(async (_, args, context) => {
  const user = await User.findById(context.user.id);

  const inviteeId = user._id;
  const updateOperation = {
    $pull: {
      invitees: inviteeId, // Remove inviteeId from the invitees array
      inviteeRoles: { id: inviteeId }, // Remove the corresponding inviteeRole
    },
  };

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Remove the user from all events where he is an invitee
    await Event.updateMany({ invitees: inviteeId }, updateOperation);

    // Delete the user
    await user.remove({ session });
  });
  session.endSession();

  return new SuccessResponse(200, true, user);
});
