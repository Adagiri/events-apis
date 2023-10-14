const asyncHandler = require('../../middleware/async');
const Event = require('../../models/Event');
const { ErrorResponse } = require('../../utils/responses');
const { transformEvent } = require('./utils');

module.exports = asyncHandler(async (_, args, context) => {
  const event = await Event.findById(args.id)
    .populate('invitees', '_id name email photo')
    .populate('owner', '_id name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  if (event.invitedEmails.indexOf(context.user.email) === -1) {
    return new ErrorResponse(403, 'You are not authorized to view this event.');
  }

  const data = transformEvent(event._doc, context.user.id);
  return data;
});
