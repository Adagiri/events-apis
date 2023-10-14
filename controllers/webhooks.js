const {
  differenceInHours,
  addDays,
  format,
  endOfDay,
  differenceInDays,
  addWeeks,
  addMonths,
  addYears,
} = require('date-fns');
const mongoose = require('mongoose');
const Event = require('../models/Event');

const {
  sendTextMessage,
  sendSingleEmail,
  sendEmailForEventReminder,
  sendPushNotificationForEventReminder,
  getUniqueElements,
} = require('../utils/misc');
const LoginSession = require('../models/LoginSession');
const User = require('../models/User');
const Notification = require('../models/Notification');
const {
  deriveNextRepetitionDate,
  deriveReminderTime,
} = require('./events/utils');

const deriveEventDateAfterRepeat = ({ repeatSequence, repeatUnit, date }) => {
  const dateToHandle = new Date(date);
  const unit = repeatUnit || 'day';
  const sequence = repeatSequence || 0;

  switch (unit) {
    case 'day':
      return addDays(dateToHandle, sequence);
    case 'week':
      return addWeeks(dateToHandle, sequence);
    case 'month':
      return addMonths(dateToHandle, sequence);
    case 'year':
      return addYears(dateToHandle, sequence);
    default:
      return new Date();
  }
};

const generateEventDayReminderEmailBodyText = (eventName, hoursTillEvent) => {
  const timeUnit = hoursTillEvent <= 1 ? 'hour' : 'hours';
  const formattedHours =
    hoursTillEvent < 1 ? 'less than 1' : Math.floor(hoursTillEvent);
  return `${eventName} Happens in ${formattedHours} ${timeUnit}.`;
};

const generateEventDayReminderPushNotificationBodyText = (hoursTillEvent) => {
  const timeUnit = hoursTillEvent <= 1 ? 'hour' : 'hours';
  const formattedHours =
    hoursTillEvent < 1 ? 'less than 1' : Math.floor(hoursTillEvent);
  return `Happens in ${formattedHours} ${timeUnit}.`;
};

const handleEventReminder = async (event, notifType) => {
  try {
    // Get all participants of the event
    const participants = getParticipants(event, notifType);

    // Handle in-app notifications
    await saveInAppNotification(participants);

    await sendEmailForEventReminder(participants);

    // Handle push notifications
    const userIds = participants.map((participant) => participant.id);
    const devices = await getPushNotificationDevices(userIds);
    const notificationRecipients = await getPushNotificationRecipients(
      devices,
      participants
    );

    // send push notifications
    if (notificationRecipients.length > 0) {
      console.log(notificationRecipients, 'notifications recipients');
      await sendPushNotificationForEventReminder(notificationRecipients);
    }
  } catch (error) {
    throw error;
  }
};

const handleEventRoutines = async (events) => {
  if (events.length > 0) {
    const eventsPerGroup = 10,
      unhandledEvents = [...events],
      eventsToHandle = unhandledEvents.splice(0, eventsPerGroup);

    // loop through events
    eventsToHandle.map(async (e) => {
      // loop through event routines
      let routines = e.routines.map((r) => {
        // eval case
        switch (r.routineType) {
          case 'email':
            // send email
            sendSingleEmail({
              email: r.email,
              message: r.note,
              subject: r.name,
            });
            break;
          case 'sms':
            // send sms
            sendTextMessage({
              sender: 'EventApp',
              recipient: r.phone,
              content: 'From: ' + r.name + '\n' + r.note,
              event: e,
            });
            break;
        }

        // update status
        r.status = 'Sent';
        return r;
      });

      // pass routines
      e.routines = routines;
      await e.save();
    });

    await handleEventRoutines(unhandledEvents);
  }
};

const getParticipants = (event, notifType) => {
  const participants = [];
  const eventName = event.title;
  const eventDate = event.date;
  const resourceId = event._id;
  const resourceType = 'Event';

  const eventOwner = getParticipant(
    {
      eventName,
      eventDate,
      resourceId,
      resourceType,
      resourceOwnerId: event.owner._id,
      user: event.owner,
      defaultReminderConfiguration: event.defaultReminderConfiguration,
      customReminderConfiguration: event.customReminderConfiguration,
    },
    notifType
  );

  participants.push(eventOwner);

  event.invitees.forEach((invitee) => {
    const eventInvitee = getParticipant(
      {
        eventName,
        eventDate,
        resourceId,
        resourceType,
        resourceOwnerId: event.owner._id,
        user: invitee,
        defaultReminderConfiguration: event.defaultReminderConfiguration,
        customReminderConfiguration: event.customReminderConfiguration,
      },
      notifType
    );

    participants.push(eventInvitee);
  });

  return participants;
};

const getParticipant = (
  {
    eventName,
    eventDate,
    resourceId,
    resourceType,
    resourceOwnerId,
    user,
    defaultReminderConfiguration,
    customReminderConfiguration,
  },
  notifType
) => {
  if (notifType === 'Custom Reminder' || notifType === 'Default Reminder') {
    const config =
      notifType === 'Custom Reminder'
        ? customReminderConfiguration
        : defaultReminderConfiguration;

    const number = config.number;
    const unit = config.unit;
    const plural = number > 1 ? 's' : '';

    const emailTitle = `Event reminder`;
    const emailBody = `${eventName} is coming up in ${number} ${unit}${plural}`;

    const pushNotificationTitle = eventName;
    const pushNotificationBody = `Happens in ${number} ${unit}${plural}`;

    return {
      id: user._id,
      email: user.email,
      resourceId,
      resourceType,
      resourceOwnerId,
      emailTitle,
      emailBody,
      pushNotificationTitle,
      pushNotificationBody,
      inAppNotificationType: 'Event Reminder Day Alert',
      inAppNotificationMessage: emailBody,
    };
  }

  if (notifType === 'Event Day Reminder') {
    const currentTime = new Date();
    const eventTime = new Date(eventDate);
    // The number of hours till the event
    const hoursTillEvent = Math.abs(
      differenceInHours(eventTime, currentTime, { roundingMethod: 'round' })
    );

    const emailTitle = `Today's event reminder`;
    const emailBody = generateEventDayReminderEmailBodyText(
      eventName,
      hoursTillEvent
    );

    const pushNotificationTitle = eventName;
    const pushNotificationBody =
      generateEventDayReminderPushNotificationBodyText(hoursTillEvent);

    return {
      id: user._id,
      email: user.email,
      resourceId,
      resourceType,
      resourceOwnerId,
      emailTitle,
      emailBody,
      pushNotificationTitle,
      pushNotificationBody,
      inAppNotificationType: 'Event Day Alert',
      inAppNotificationMessage: emailBody,
    };
  }

  return {};
};

const saveInAppNotification = async (participants) => {
  // Handle payload for notifications
  const notificationPayload = participants.map((participant) => {
    return {
      owner: participant.id,
      initiator: participant.resourceOwnerId,
      type: participant.inAppNotificationType,
      message: participant.inAppNotificationMessage,
      resourceType: 'Event',
      resourceId: participant.resourceId,
      isActionRequired: false,
    };
  });

  const uniqueParticipants = getUniqueElements(participants, 'id');
  const uniqueParticipantsIds = uniqueParticipants.map(
    (participant) => participant.id
  );

  console.log(participants.length, 'participants');
  console.log(uniqueParticipants.length, 'unique participants');

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    await Notification.create(notificationPayload, { session });

    // Save notification count for each participant
    await User.updateMany(
      { _id: uniqueParticipantsIds },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();
};

const saveUserNotifcationCount = async (userUpdates, session) => {
  if (userUpdates.length === 0) {
    return 'done';
  } else {
    const updateToHandle = userUpdates[0];
    await User.findByIdAndUpdate(
      updateToHandle.id,
      { $inc: updateToHandle.update },
      {
        session,
      }
    );

    const unhandledUpdates = userUpdates.slice(1);
    await saveUserNotifcationCount(unhandledUpdates, session);
  }
};

const getPushNotificationDevices = async (userIds) => {
  return await LoginSession.find({ user: userIds, deviceToken: { $ne: null } });
};

const getPushNotificationRecipients = async (devices, participants) => {
  const recipients = [];

  participants.forEach((participant) => {
    // Get active devices of a participant
    const participantDevices = devices.filter(
      (device) => device.user.toString() === participant.id.toString()
    );

    if (participantDevices.length > 0) {
      // Create notification payload for each device
      participantDevices.forEach((device) => {
        const recipient = {
          resourceId: participant.resourceId,
          resourceType: participant.resourceType,
          pushNotificationBody: participant.pushNotificationBody,
          pushNotificationTitle: participant.pushNotificationTitle,
          deviceToken: device.deviceToken,
        };

        recipients.push(recipient);
      });
    }
  });

  return recipients;
};

module.exports.sendRoutineMessagesAndEmailsForEvent = async () => {
  const today = new Date().toLocaleDateString();

  const query = {
    dateString: { $eq: today },
    routineCount: { $gt: 0 },
  };

  const events = await Event.find(query).populate('owner', 'email');

  await handleEventRoutines(events);
};

const handleCustomReminders = async () => {
  const currentTimestamp = new Date();

  const twoMinutesFromNow = new Date(
    currentTimestamp.getTime() + 2 * 60 * 1000
  );

  try {
    const query = {
      customReminderNotificationsSent: false, // Custom reminders that have not been handled yet
      customReminderTime: { $gte: currentTimestamp, $lte: twoMinutesFromNow }, // Events whose reminder time is within the next 2 minutes.
    };

    let events = await Event.find(query)
      .populate('invitees', 'email eventSettings')
      .populate('owner', 'email eventSettings');

    console.log('Events set for custom reminders: ', events.length);

    for (const event of events) {
      const notifType = 'Custom Reminder';
      await handleEventReminder(event, notifType);
    }

    let eventIds = events.map((event) => event._id);
    await Event.updateMany(
      { _id: eventIds },
      { customReminderNotificationsSent: true }
    );
    console.log('Custom reminders handled successfully.');
  } catch (error) {
    console.log('Error occured whilst handling custom reminders: ', error);
    throw error;
  }
};

const handleDefaultReminders = async () => {
  const currentTimestamp = new Date();

  const twoMinutesFromNow = new Date(
    currentTimestamp.getTime() + 2 * 60 * 1000
  );

  try {
    const query = {
      $and: [
        {
          defaultReminderNotificationsSent: false, // Default reminders that have not been handled yet
          defaultReminderTime: {
            $gte: currentTimestamp,
            $lte: twoMinutesFromNow,
          }, // Events whose default reminder time is within the next 2 minutes
        },
        {
          $expr: {
            $ne: ['$defaultReminderTime', '$customReminderTime'], // Events whose default reminder time and custom reminder time are different
          },
        },
      ],
    };

    const events = await Event.find(query)
      .populate('invitees', 'email eventSettings')
      .populate('owner', 'email eventSettings');

    console.log('Events set for default reminders: ', events.length);

    for (const event of events) {
      const notifType = 'Default Reminder';
      if (!customReminderTime) {
        await handleEventReminder(event, notifType);
      }
    }

    let eventIds = events.map((event) => event._id);
    await Event.updateMany(
      { _id: eventIds },
      { defaultReminderNotificationsSent: true }
    );
    console.log('Default reminders handled successfully.');
  } catch (error) {
    console.log('Error occured whilst handling default reminders: ', error);
    throw error;
  }
};

module.exports.handleEventReminders = async () => {
  try {
    await handleCustomReminders();
    await handleDefaultReminders();
  } catch (error) {
    console.log('Error occured whilst handling event reminders: ', error);
    throw error;
  }
};

module.exports.sendRoutineMessagesAndEmailsForEvent = async () => {
  const today = new Date().toLocaleDateString();

  const query = {
    dateString: { $eq: today },
    routineCount: { $gt: 0 },
  };

  const events = await Event.find(query).populate('owner', 'email');

  await handleEventRoutines(events);
};

const generateEventRepeatUpdates = (event) => {
  const currentStartDate = new Date(event.date);
  const currentEndDate = new Date(event.endDate);
  const repeatSequence = event.repeatConfiguration.sequence;
  const repeatUnit = event.repeatConfiguration.unit;
  const customReminderConfiguration = event.customReminderConfiguration;
  const defaultReminderConfiguration = event.defaultReminderConfiguration;

  // Extend the start and end dates while preserving the time
  const newStartDate = deriveEventDateAfterRepeat({
    repeatSequence,
    repeatUnit,
    date: currentStartDate,
  });
  const newEndDate = deriveEventDateAfterRepeat({
    repeatSequence,
    repeatUnit,
    date: currentEndDate,
  });

  // Calculate the next repetition date and custom/default reminder times
  const nextRepetitionDate = deriveNextRepetitionDate({
    endDate: newEndDate,
  });

  const nextRepetitionDay = nextRepetitionDate.toLocaleDateString();

  const currentCustomReminderTime = event.customReminderTime;
  let customReminderTime = undefined;
  if (currentCustomReminderTime) {
    customReminderTime = deriveReminderTime({
      eventStartDate: newStartDate,
      reminderNumber: customReminderConfiguration.number,
      reminderUnit: customReminderConfiguration.unit,
    });
  }

  const defaultReminderTime = deriveReminderTime({
    eventStartDate: newStartDate,
    reminderNumber: defaultReminderConfiguration.number,
    reminderUnit: defaultReminderConfiguration.unit,
  });

  const defaultReminderNotificationsSent = false;
  const customReminderNotificationsSent = false;

  const updates = {
    date: newStartDate,
    endDate: newEndDate,
    nextRepetitionDate,
    nextRepetitionDay,
    customReminderTime,
    defaultReminderTime,
    defaultReminderNotificationsSent,
    customReminderNotificationsSent,
  };

  return updates;
};

module.exports.handleEventRepeat = async () => {
  try {
    const currentTimestamp = new Date();
    const currentDateString = new Date().toLocaleDateString();

    // Define the query to find events that need updating
    const query = {
      'repeatConfiguration.isEnabled': true,
      'repeatConfiguration.endTime': { $gt: currentTimestamp },
      endDate: { $lt: currentTimestamp },
      nextRepetitionDay: currentDateString,
    };

    // Find events based on the query
    const events = await Event.find(query);

    console.log(`events found for updating: `, events.length);

    for (const event of events) {
      const updates = generateEventRepeatUpdates(event);
      await Event.findByIdAndUpdate(event._id, updates);
      console.log('Event Repeat Updates Completed');
    }
  } catch (error) {
    console.error('Error handling repeating events:', error);
    throw error;
  }
};
