const endOfDay = require('date-fns/endOfDay');
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/async');
const Event = require('../../models/Event');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const {
  sendEmailForEventInvitation,
  sendPushNotificationForEventInvitation,
  deleteOldFile,
} = require('../../utils/misc');
const { SuccessResponse, ErrorResponse } = require('../../utils/responses');
const { startOfDay } = require('date-fns');
const {
  isEventOwner,
  getEventParticipantEmails,
  getUsersByEmail,
  getUnregisteredEmails,
  getRecipientsForEmailNotification,
  getNotifiableDevices,
  transformEvent,
  deriveReminderTime,
  deriveNextRepetitionDate,
} = require('./utils');

module.exports = asyncHandler(async (_, args, context) => {
  const input = args.input;
  const userId = context.user.id;
  const username = context.user.name;

  // Check that the invitor is not trying to invite himself
  if (input.invitedEmails.indexOf(context.user.email) !== -1) {
    return new ErrorResponse(
      400,
      'You cannot send email invite to your own email.'
    );
  }

  const event = await Event.findById(args.id)
    .populate('invitees', '_id name email photo')
    .populate('owner', '_id name email photo eventSettings');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  if (!isEventOwner(event, userId)) {
    return new ErrorResponse(403, 'You are not authorized to edit this event.');
  }

  // Make sure that the day set for reminder is at least one day before the event day
  if (input.daysBtwnReminderAndEvent <= 0) {
    return new ErrorResponse(
      400,
      'Reminder day and event day must be at least 1 day apart.'
    );
  }
  const oldBgCover = event.bgCover;
  const participantEmails = getEventParticipantEmails(event);

  // Emails of participant whose emails was specified for invite again
  const participantEmailsSetForInvite = [];
  // List of emails of which invitation has been sent to before but have not accepted or rejected the invite, and are now specified for invitation again
  const preInvitedEmailsSetForInvite = [];
  // Emails that are not participants or pre-invited emails
  const invitableEmails = [];

  input.invitedEmails.forEach((email) => {
    if (event.invitedEmails.indexOf(email) !== -1) {
      preInvitedEmailsSetForInvite.push(email);
    } else if (participantEmails.indexOf(email) !== -1) {
      participantEmailsSetForInvite.push(email);
    } else {
      invitableEmails.push(email);
    }
  });

  if (participantEmailsSetForInvite.length > 0) {
    const plural = participantEmailsSetForInvite.length > 1;
    const emails = participantEmailsSetForInvite.join(', ');
    const message = plural
      ? `The email owners of '${emails}' are already in this event.`
      : `The email owner of '${emails}' is already in this event.`;
    return new ErrorResponse(400, message);
  }

  if (preInvitedEmailsSetForInvite.length > 0) {
    const plural = preInvitedEmailsSetForInvite.length > 1;
    const emails = preInvitedEmailsSetForInvite.join(', ');
    const message = plural
      ? `The email owners of ${emails} have already been invited to this event.`
      : `The email owner of ${emails} have already been invited to this event.`;
    return new ErrorResponse(400, message);
  }

  if (input.isAllDay) {
    input.date = startOfDay(input.date); //
    input.endDate = endOfDay(input.date); //
  }

  // Add necessary updates (title, date, daysBtwnReminderAndEvent, customReminderTime, bgCover, todos, todoCount, isInviteLinkActive, invitations. invitedEmails)

  event.title = input.title;
  input.description && (event.description = input.description);
  input.isAllDay && (event.isAllDay = input.isAllDay);

  event.date = input.date;
  event.endDate = input.endDate;

  if (input.customReminderConfiguration) {
    event.customReminderTime = deriveReminderTime({
      eventStartDate: input.date,
      reminderUnit: input.customReminderConfiguration.unit || 'minute',
      reminderNumber: input.customReminderConfiguration.number || 15,
    });

    event.customReminderConfiguration = input.customReminderConfiguration;
  }

  const defaultReminderConfiguration =
    event.owner.eventSettings.defaultReminderConfiguration;

  event.defaultReminderTime = deriveReminderTime({
    eventStartDate: input.date,
    reminderUnit: defaultReminderConfiguration?.unit || 'minute',
    reminderNumber: defaultReminderConfiguration?.number || 15,
  });

  event.defaultReminderConfiguration = defaultReminderConfiguration;

  // Set next repetition date
  if (input.repeatConfiguration && input.repeatConfiguration.isEnabled) {
    const nextRepetitionDate = deriveNextRepetitionDate({
      endDate: input.endDate,
    });
    event.nextRepetitionDate = nextRepetitionDate;
    event.nextRepetitionDay = nextRepetitionDate.toLocaleDateString();
  }
  event.repeatConfiguration = input.repeatConfiguration;

  event.bgCover = input.bgCover;

  input.location && (event.location = input.location);

  event.todos = input.todos;
  event.routines = input?.routines || [];

  event.todoCount = input.todos.length;
  event.routineCount = input?.routines?.length || 0;

  // count routine(s)
  if (event.routineCount) {
    // get max email routines
    const maxEmailRoutines = parseInt(process.env.EVENT_EMAIL_ROUTINE_MAX, 10),
      // get email rorutines
      emailRoutines = input.routines.filter((e) => e.routineType == 'email');
    // check that email routines aren't more than set number
    if (emailRoutines.length > maxEmailRoutines) {
      return new ErrorResponse(
        400,
        `You cannot add more than ${maxEmailRoutines} email routines.`
      );
    }
  }

  event.isInviteLinkActive = input.isInviteLinkActive;

  invitableEmails.forEach((email) => {
    event.invitations.push({
      email: email,
      invitor: userId,
    });
  });

  event.invitedEmails.push(...invitableEmails);

  // Get data of all users who own an email from the list of invitable emails
  const registeredUsers = await getUsersByEmail(invitableEmails);

  const notificationPayload = registeredUsers.map((user) => {
    return {
      owner: user._id,
      initiator: userId,
      type: 'Event Invite',
      message: `Invited you to an event. ${event.title}`,
      resourceType: 'Event',
      resourceId: event._id,
      isActionRequired: true,
      actionType: 'Accept or Decline Invitation',
      actionTaken: false,
    };
  });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event____________________
    await event.save({ session });

    if (registeredUsers.length > 0) {
      // Save in app notification for registered users
      await Notification.create(notificationPayload, { session });

      // Increase notification count by 1 for each eligible user
      await User.updateMany(
        { _id: registeredUsers.map((user) => user._id) },
        { $inc: { newNotifications: 1, unreadNotifications: 1 } },
        { session }
      );
    }
  });

  const registeredEmails = registeredUsers.map((user) => user.email);

  const unregisteredEmails = getUnregisteredEmails(
    registeredEmails,
    invitableEmails
  );

  const unregisteredEmailRecipients = unregisteredEmails.map((email) => {
    return {
      email,
      timeZone: undefined,
    };
  });

  // Emails of registered users that have email notification turned on for (event invite)
  const registeredEmailRecipients = getRecipientsForEmailNotification(
    registeredUsers,
    'eventInvite'
  );

  const emailRecipients = [
    ...unregisteredEmailRecipients,
    ...registeredEmailRecipients,
  ];

  // Send invitations via email____________________
  if (emailRecipients.length > 0) {
    await sendEmailForEventInvitation({
      emailRecipients,
      eventName: event.title,
      initiator: username || 'An anonymous user',
      date: event.date,
    });
  }

  // From the user list above, get users that have push notification turned on for (event invites)
  const notifiableDevices = await getNotifiableDevices(
    registeredUsers,
    'eventInvite'
  );

  const type = 'Event Invite';
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send invitations via push notification____________________
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForEventInvitation({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      initiator: username || 'An anonymous user',
    });
  }

  if (oldBgCover !== input.bgCover) {
    await deleteOldFile(oldBgCover);
  }

  const data = transformEvent(event._doc, userId);

  return new SuccessResponse(200, true, data);
});
