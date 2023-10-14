const asyncHandler = require('../middleware/async');
const User = require('../models/User');
const { getCalendarAuthTokens } = require('../services/GoogleService');
const { ErrorResponse, SuccessResponse } = require('../utils/responses');

const transformAppleCalendarEvents = (events) => {
  return events.map((event) => ({
    platformSource: 'Apple',
    platformSourceId: event.id,
    title: event.title,
    date: new Date(event.start),
    endDate: new Date(event.end),
    daysBtwnReminderAndEvent: 5,
    bgCover: '',
    'location.address': event.location || undefined,
  }));
};

const transformGoogleCalendarEvents = (events) => {
  return events.map((event) => ({
    platformSource: 'Google',
    platformSourceId: event.id,
    title: event.summary,
    description: event.description,
    date: new Date(event.start.dateTime),
    endDate: new Date(event.end.dateTime),
    daysBtwnReminderAndEvent: 5,
    bgCover: '',
    'location.address': event.location,
  }));
};

// calendar_importGoogleCalendarEvents;
module.exports.getAppleAccessToken = asyncHandler(async (_, args, context) => {
  const user = await User.findById(context.user.id).select(
    '+appleCalendarAccessToken'
  );

  return user.appleCalendarAccessToken;
});

module.exports.setAppleAccessToken = asyncHandler(async (_, args, context) => {
  const user = await User.findByIdAndUpdate(context.user.id, {
    appleCalendarAccessToken: args.accessToken,
  });

  return new SuccessResponse(200, true);
});

module.exports.saveAppleCalendarEvents = asyncHandler(
  async (_, args, context) => {
    const userId = context.user.id;
    const eventsFromCalendar = args.event;

    const transformedEvents = transformAppleCalendarEvents(eventsFromCalendar);

    const existingEvents = await Event.find({
      owner: userId,
      platformSource: 'Apple',
    }).select('platformSourceId');

    const eventArgs = transformedEvents.filter((event) => {
      const index = existingEvents.findIndex(
        (existingEvent) => existingEvent.platformSourceId === event.id
      );

      if (index === -1) {
        return false;
      }

      return true;
    });

    const events = await Event.create(eventArgs);
    console.log(events, 'created apple calendar events');

    return new SuccessResponse(201, true);
  }
);

module.exports.setGoogleRefreshToken = asyncHandler(
  async (_, args, context) => {
    const authorizationCode = args.authorizationCode;
    const userId = context.user.id;

    const { refreshToken } = await getCalendarAuthTokens(authorizationCode);

    await User.findByIdAndUpdate(userId, {
      googleCalendarApiRefreshToken: refreshToken,
      isGoogleCalendarApiAuthorized: true,
    });

    return new SuccessResponse(200, true);
  }
);

module.exports.importGoogleCalendarEvents = asyncHandler(
  async (_, args, context) => {
    const userId = context.user.id;

    const user = await User.findById(userId).select(
      'googleCalendarApiRefreshToken isGoogleCalendarApiAuthorized'
    );

    if (
      !user.googleCalendarApiRefreshToken ||
      !user.isGoogleCalendarApiAuthorized
    ) {
      return new ErrorResponse(
        400,
        'You have not authorized the app with the necessary permissions to perform this action.'
      );
    }

    const eventsFromCalendar = await getGoogleCalendarEvents(
      user.googleCalendarApiRefreshToken,
      userId
    );

    const transformedEvents = transformGoogleCalendarEvents(eventsFromCalendar);

    const existingEvents = await Event.find({
      owner: userId,
      platformSource: 'Google',
    }).select('platformSourceId');

    const eventArgs = transformedEvents.filter((event) => {
      const index = existingEvents.findIndex(
        (existingEvent) => existingEvent.platformSourceId === event.id
      );

      if (index === -1) {
        return false;
      }

      return true;
    });

    const events = await Event.create(eventArgs);
    console.log(events, 'created Google calendar events');

    return new SuccessResponse(201, true);
  }
);
