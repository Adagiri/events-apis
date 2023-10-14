const endOfDay = require('date-fns/endOfDay');
const sub = require('date-fns/sub');
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/async');
const Event = require('../../models/Event');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const {
  sendEmailForEventInvitation,
  sendPushNotificationForEventInvitation,
} = require('../../utils/misc');
const { SuccessResponse, ErrorResponse } = require('../../utils/responses');
const { createDeepLink } = require('../../services/GoogleService');

const { startOfDay } = require('date-fns');
const {
  isUserFreeOrPremium,
  getUsersByEmail,
  getUnregisteredEmails,
  getRecipientsForEmailNotification,
  getNotifiableDevices,
  getLoggedInUserRoleInEvent,
  deriveReminderTime,
  deriveNextRepetitionDate,
} = require('./utils');

module.exports = asyncHandler(async (_, args, context) => {
  const input = args.input;
  const userId = context.user.id;
  const username = context.user.name;

  const userData = await User.findById(userId).select(
    'eventSettings subscriptionInfo'
  );

  const createdEventsCount = await Event.countDocuments({ owner: userId });

  if (createdEventsCount >= 1) {
    const subscriptionInfo = userData.subscriptionInfo;

    const isFreeOrPremium = isUserFreeOrPremium(subscriptionInfo);

    if (isFreeOrPremium === false) {
      return new ErrorResponse(
        403,
        'You are currently on the free plan and can only create one(1) event. Please upgrade to Pro plan to create more events and unlock more features.'
      );
    }
  }

  // Check that the user is not inviting himself
  if (input.invitedEmails.indexOf(context.user.email) !== -1) {
    return new ErrorResponse(
      400,
      'You cannot send email invite to your own email.'
    );
  }

  // Make sure that customReminderTime is greater than 0
  if (input.daysBtwnReminderAndEvent <= 0) {
    return new ErrorResponse(
      400,
      'Reminder day and event day must be at least 1 day apart.'
    );
  }

  // Add necessary fields for creating the event
  input.owner = userId;
  input._id = mongoose.Types.ObjectId();
  input.invitations = input.invitedEmails.map((email) => {
    return {
      email: email,
      invitor: userId,
    };
  });

  if (input.todos) {
    input.todoCount = input.todos.length;
  }

  // Get no of routines
  input.routineCount = input?.routines?.length || 0;
  // count routine(s)
  if (input.routineCount) {
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

  // Set the date string
  if (input.isAllDay) {
    input.date = startOfDay(input.date); //
    input.endDate = endOfDay(input.date); //
  }

  // Set the custom reminder time____________________
  if (input.customReminderConfiguration) {
    input.customReminderTime = deriveReminderTime({
      eventStartDate: input.date,
      reminderUnit: input.customReminderConfiguration.unit || 'minute',
      reminderNumber: input.customReminderConfiguration.number || 15,
    });
  }

  // Set next repetition date
  if (input.repeatConfiguration && input.repeatConfiguration.isEnabled) {
    const nextRepetitionDate = deriveNextRepetitionDate({
      endDate: input.endDate,
    });
    input.nextRepetitionDate = nextRepetitionDate;
    input.nextRepetitionDay = nextRepetitionDate.toLocaleDateString();
  }

  input.platformSource = 'Custom';
  // Set default reminder time
  input.defaultReminderConfiguration =
    userData.eventSettings.defaultReminderConfiguration;
  input.defaultReminderTime = deriveReminderTime({
    eventStartDate: input.date,
    reminderUnit: input.defaultReminderConfiguration?.unit || 'minute',
    reminderNumber: input.defaultReminderConfiguration?.number || 15,
  });

  // Make sure that there are no duplicate invite link id in the database____________________
  // Check if the invite link id is taken, if taken, replace it
  const inviteLinkId = await createDeepLink(input._id.toString());

  input.inviteLinkId = inviteLinkId;

  // Exclude event owner's email and update invitedEmails field of the event
  const invitableEmails = input.invitedEmails.filter(
    (email) => email !== context.user.email
  );
  input.invitedEmails = invitableEmails;

  // Get the registered users who own the invited emails above
  const registeredUsers = await getUsersByEmail(invitableEmails);

  const notificationPayload = registeredUsers.map((user) => {
    return {
      owner: user._id,
      initiator: userId,
      type: 'Event Invite',
      message: `Invited you to an event. ${input.title}`,
      resourceType: 'Event',
      resourceId: input._id,
      isActionRequired: true,
      actionType: 'Accept or Decline Invitation',
      actionTaken: false,
    };
  });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Create the event____________________
    await Event.create([input], { session });

    if (registeredUsers.length > 0) {
      // Save invite-notification for each invited, registered user
      await Notification.create(notificationPayload, { session });

      // Increase notification count by 1 for each invited, registered user
      await User.updateMany(
        { email: registeredUsers.map((user) => user.email) },
        { $inc: { newNotifications: 1, unreadNotifications: 1 } },
        { session }
      );
    }
  });
  session.endSession();

  const event = await Event.findById(input._id)
    .populate('invitees', '_id name email photo')
    .populate('owner', '_id name email photo');

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

  // From the user list above, get users that have push notification turned on for (event invite)
  const notifiableDevices = await getNotifiableDevices(
    registeredUsers,
    'eventInvite'
  );

  const type = 'Event Invite';
  const resourceType = 'Event';
  const resourceId = input._id;
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

  // Generate logged-in user's role
  event.myRole = getLoggedInUserRoleInEvent(context.user.id, event);
  return new SuccessResponse(200, true, event);
});
