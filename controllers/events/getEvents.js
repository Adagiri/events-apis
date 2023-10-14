const endOfDay = require('date-fns/endOfDay');
const asyncHandler = require('../../middleware/async');
const Event = require('../../models/Event');

const { SuccessResponse, ErrorResponse } = require('../../utils/responses');
const { createDeepLink } = require('../../services/GoogleService');
const { transformEvent } = require('./utils');

module.exports = asyncHandler(async (_, args, context) => {
  const userId = context.user.id;
  const query = {
    $or: [{ owner: userId }, { invitees: { $in: [userId] } }],
  };

  const events = await Event.find(query)
    .populate('invitees', '_id name email photo')
    .populate('owner', '_id name email photo')
    .sort({ date: 1 });

  let data = events.map((event, key) => {
    const resp = transformEvent(event._doc, userId);

    return resp;
  });


  // EVENT FILTERING
  const today = new Date();

  if (args.status === 'Upcoming') {
    data = data.filter((event) => {
      return endOfDay(event.date).getTime() >= endOfDay(today).getTime();
    });
  }

  if (args.status === 'Passed') {
    data = data.filter((event) => {
      return endOfDay(event.date).getTime() < endOfDay(today).getTime();
    });
  }

  return data;
});
