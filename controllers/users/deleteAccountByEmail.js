const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/async');
const Event = require('../../models/Event');
const User = require('../../models/User');
const { SuccessResponse, ErrorResponse } = require('../../utils/responses');

module.exports = asyncHandler(async (_, args, context) => {
  if (process.env.TEST_ENV === 'true') {
    const user = await User.findOne({ email: args.email });

    if (!user) {
      return new ErrorResponse(404, 'Account not found');
    }

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
      const events = await Event.updateMany(
        { invitees: inviteeId },
        updateOperation
      );
      console.log(events, events.length);

      // Delete the user
      await user.remove({ session });
    });
    session.endSession();

    return new SuccessResponse(200, true, user);
  } else {
    return new ErrorResponse(400, 'You cannot call this api in production');
  }
});
