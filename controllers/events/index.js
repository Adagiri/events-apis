const endOfDay = require('date-fns/endOfDay');
const sub = require('date-fns/sub');
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/async');
const Event = require('../../models/Event');
const LoginSession = require('../../models/LoginSession');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const {
  generateNewInviteLinkId,
  sendEmailForEventInvitation,
  sendPushNotificationForEventInvitation,
  sendEmailForEventDeletion,
  sendPushNotificationForEventDeletion,
  sendPushNotificationForEventInviteAcceptance,
  sendEmailForEventInviteAcceptance,
  sendEmailForEventInviteRejection,
  sendPushNotificationForEventInviteRejection,
  sendEmailForInviteeRemoval,
  sendPushNotificationForInviteeRemoval,
  sendEmailForTodoCompleted,
  sendEmailForTodoUnmarked,
  sendPushNotificationForTodoCompleted,
  sendPushNotificationForTodoUnmarked,
  sendEmailForTodoAdded,
  sendPushNotificationForTodoAdded,
  sendEmailForTodoEdited,
  sendPushNotificationForTodoEdited,
  sendEmailForTodoDeleted,
  sendPushNotificationForTodoDeleted,
  sendEmailForEventRoleAssigned,
  sendPushNotificationForEventRoleAssigned,
  deleteOldFile,
  sendSingleEmail,
  sendTextMessage,
} = require('../../utils/misc');
const { SuccessResponse, ErrorResponse } = require('../../utils/responses');
const { createDeepLink } = require('../../services/GoogleService');
const getEvents = require('./getEvents');
const getEventByIdForInvitedUsers = require('./getEventByIdForInvitedUsers');
const { startOfDay } = require('date-fns');
const createEvent = require('./createEvent');
const editEvent = require('./editEvent');

const checkIfPremiumIsActive = (subscriptionInfo) => {
  if (subscriptionInfo.isPremiumActive) {
    return true;
  }

  return false;
};

const checkIfFreeTrialIsActive = (subscriptionInfo) => {
  const currentTime = new Date();
  const freeTrialExpiryDate = new Date(subscriptionInfo.freeTrialExpiryDate);
  const isFreeTrialActive = subscriptionInfo.isFreeTrialActive;

  if (isFreeTrialActive && freeTrialExpiryDate > currentTime) {
    return true;
  }

  return false;
};

const isUserFreeOrPremium = (subscriptionInfo) => {
  const isPremiumActive = checkIfPremiumIsActive(subscriptionInfo);
  const isFreeTrialActive = checkIfFreeTrialIsActive(subscriptionInfo);

  if (isPremiumActive || isFreeTrialActive) {
    return true;
  }

  return false;
  //   return true;
};

const emailExist = (email, emailList) => {
  return emailList.indexOf(email) !== -1;
};

const getEventParticipantEmails = (event) => {
  const emails = [];

  emails.push(event.owner.email);

  event.invitees.forEach((invitee) => {
    emails.push(invitee.email);
  });

  return emails;
};

const getUnregisteredEmails = (registeredEmails, invitableEmails) => {
  return invitableEmails.filter(
    (email) => emailExist(email, registeredEmails) === false
  );
};

const getNotifiableEmails = (registeredUsers, scenerio) => {
  return registeredUsers
    .filter((user) => user.emailNotifSettings[scenerio] === true)
    .map((user) => user.email);
};

const getRecipientsForEmailNotification = (registeredUsers, scenerio) => {
  return registeredUsers
    .filter((user) => user.emailNotifSettings[scenerio] === true)
    .map((user) => {
      const timeZone = user.eventSettings.timeZone;
      const email = user.email;

      return {
        timeZone,
        email,
      };
    });
};

// Get users that are eligible for receiving push notifications when an action occur directly on an event (todo actions are not included)
const getNotifiableDevices = async (registeredUsers, scenerio) => {
  // Filter out users that have push notification turned off for the given scenerio
  const eligibleUsers = registeredUsers.filter(
    (user) => user.pushNotifSettings[scenerio] === true
  );

  // Get ids
  const ids = eligibleUsers.map((user) => user._id);

  // Check the sessions that match user ids
  const sessions = await LoginSession.find({ user: { $in: ids } });

  // Filter out invalid device token
  const deviceTokens = sessions
    .filter((session) => !!session.deviceToken)
    .map((session) => session.deviceToken);
  return deviceTokens;
};

//  gets a list of users whose emails are present in a list of emails
const getUsersByEmail = async (emails) => {
  return await User.find({ email: emails }).select(
    'name email emailNotifSettings pushNotifSettings isPushNotifTokenSaved androidPushNotifToken iosPushNotifToken eventSettings'
  );
};

const permissions = {
  getEvent: ['Admin', 'Editor', 'Viewer'],
  deleteEvent: [],
  toggleEventInviteLink: ['Admin'],
  inviteUserToEvent: ['Admin', 'Editor'],
  removeInviteeFromEvent: ['Admin', 'Editor'],
  assignEventRole: ['Admin'],
  addTodo: ['Admin', 'Editor'],
  editTodo: ['Admin', 'Editor'],
  deleteTodo: ['Admin', 'Editor'],
  markTodo: ['Admin', 'Editor'],
  duplicateTodo: ['Admin', 'Editor'],
  addRoutine: ['Admin', 'Editor'],
  editRoutine: ['Admin', 'Editor'],
  deleteRoutine: ['Admin', 'Editor'],
};

const getLoggedInUserRoleInEvent = (loggedInUserId, event) => {
  // Check if the logged-in user is already an invitee
  const isInvitee = event.invitees.find(
    (invitee) => invitee._id.toString() === loggedInUserId.toString()
  );

  if (loggedInUserId.toString() === event.owner._id.toString()) {
    return 'Admin';
  } else if (isInvitee) {
    return isInvitee.role;
  } else {
    return 'None';
  }
};

const transformEvent = (event, loggedInUserId) => {
  const inviteeRoles = event.inviteeRoles;

  event.invitees = event.invitees.map((invitee) => {
    const inviteeId = invitee._id;

    const doc = inviteeRoles.find(
      (role) => role.id.toString() === inviteeId.toString()
    );

    invitee.role = doc.role;
    invitee.id = invitee._id;

    return invitee;
  });

  // MY ROLE = LOGGED-IN USER'S ROLE IN THE EVENT
  event.myRole = getLoggedInUserRoleInEvent(loggedInUserId, event);
  event.id = event._id;

  return event;
};

function checkPermission(operation, userId, event) {
  // CASE 1: The event owner is carrying out the action
  if (event.owner._id.toString() === userId.toString()) {
    return {
      hasPermission: true,
      userType: 'Owner',
      notifHosts: event.invitees.map((invitee) => invitee._id),
      executor: userId,
    };
  }

  // CASE 2: An invitee is carrying out the action
  const inviteeRole = event.inviteeRoles.find(
    (role) => role.id.toString() === userId.toString()
  )?.role;

  if (inviteeRole) {
    // Check if the invitee has the required permission
    if (permissions[operation].indexOf(inviteeRole) !== -1) {
      const notifHosts = event.invitees
        .filter((invitee) => invitee._id.toString() !== userId.toString())
        .map((invitee) => invitee._id);

      // Include the event owner's id too
      notifHosts.push(event.owner._id);

      return {
        hasPermission: true,
        userType: 'Invitee',
        notifHosts,
        executor: userId,
      };
    } else {
      return {
        hasPermission: false,
      };
    }
  } else {
    return {
      hasPermission: false,
    };
  }
}

const isEventOwner = (event, userId) => {
  if (event.owner._id.toString() === userId.toString()) {
    return true;
  } else {
    return false;
  }
};

const isInvitee = (inviteeId, event) => {
  return (
    event.invitees.findIndex(
      (invitee) => invitee._id.toString() === inviteeId
    ) !== -1
  );
};

module.exports.getEvents = getEvents;

module.exports.getEventByIdForInvitedUsers = getEventByIdForInvitedUsers;

module.exports.getEventByIdForInvitationLinks = asyncHandler(
  async (_, args, context) => {
    const event = await Event.findById(args.id)
      .populate('invitees', '_id name email photo')
      .populate('owner', '_id name email photo');

    if (!event) {
      return new ErrorResponse(404, 'Event not found.');
    }

    if (event.owner._id.toString() === context.user.id.toString()) {
      return new ErrorResponse(
        400,
        'You created this event; hence, you are already a member.'
      );
    }

    const participantEmails = getEventParticipantEmails(event);

    if (participantEmails.indexOf(context.user.email) !== -1) {
      return new ErrorResponse(400, 'You are already a member of this event.');
    }

    // Handle Permissions
    if (event.isInviteLinkActive === false) {
      return new ErrorResponse(403, 'Invite link is inactive.');
    }

    const data = transformEvent(event._doc, context.user.id);
    data.owner.id = data.owner._id;
    return data;
  }
);

module.exports.getEventById = asyncHandler(async (_, args, context) => {
  const event = await Event.findById(args.id)
    .populate('invitees', '_id name email photo')
    .populate('owner', '_id name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('getEvent', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not a member of this event.');
  }

  const data = transformEvent(event._doc, context.user.id);
  data.owner.id = data.owner._id;
  return data;
});

module.exports.generateInviteLinkId = asyncHandler(async (_, args, context) => {
  // Generate new invite link
  const newInviteLinkId = await generateNewInviteLinkId();

  return newInviteLinkId;
});

module.exports.createEvent = createEvent;

module.exports.editEvent = editEvent;

// @desc Delete an event
// @type MUTATION
// @access Private
module.exports.deleteEvent = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('invitees', 'name email')
    .populate('owner', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('deleteEvent', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(
      403,
      'You are not authorized to delete this event.'
    );
  }

  const notificationPayload = permission.notifHosts.map((user) => {
    return {
      owner: user,
      initiator: context.user.id,
      type: 'Event Delete',
      message: `Deleted the event. ${event.title}`,
      resourceType: 'Event',
      resourceId: event._id,
      isActionRequired: false,
    };
  });
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Delete the event__________________
    await Event.findByIdAndRemove(args.id, { session });

    // Save in-app notification for each invitee
    await Notification.create(notificationPayload, { session });

    // Increase notification count by 1 for each invited-registered-user
    await User.updateMany(
      { _id: permission.notifHosts },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Handle Email and Push notifications
  const eventUsers = await User.find({ _id: permission.notifHosts });

  // Handle email notification
  const notifiableEmails = getNotifiableEmails(eventUsers, 'eventDelete');

  // Send email notifications
  if (notifiableEmails.length > 0) {
    await sendEmailForEventDeletion({
      emails: notifiableEmails,
      eventName: event.title,
      initiator: context.user.name || 'An anonymous user',
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    eventUsers,
    'eventDelete'
  );

  const type = 'Event Delete';
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForEventDeletion({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
    });
  }

  const data = transformEvent(event._doc, context.user.id);
  return new SuccessResponse(200, true, data);
});

// @desc Toggle invitation link to either active or inactive
// @type MUTATION
// @access Private
module.exports.toggleInviteLink = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }
  // Handle Permissions
  const permission = checkPermission(
    'toggleEventInviteLink',
    context.user.id,
    event
  );

  if (!permission.hasPermission) {
    return new ErrorResponse(
      403,
      'You are not authorized to edit this part of the event.'
    );
  }
  // Edit the event___________________
  event.isInviteLinkActive = args.isInviteLinkActive;
  await event.save();

  const data = transformEvent(event._doc, context.user.id);
  return new SuccessResponse(200, true, data);
});

// @desc Invite users to an event
// @type MUTATION
// @access Private
module.exports.inviteUsers = asyncHandler(async (_, args, context) => {
  const username = context.user.name;
  const userId = context.user._id;

  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission(
    'inviteUserToEvent',
    context.user.id,
    event
  );

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to invite users.');
  }

  // Check that the user is not inviting himself
  if (args.invitedEmails.indexOf(context.user.email) !== -1) {
    return new ErrorResponse(
      400,
      'You cannot send email invite to your own email.'
    );
  }
  const participantEmails = getEventParticipantEmails(event);

  // Emails of participant whose emails was specified for invite again
  const participantEmailsSetForInvite = [];
  // List of emails of which invitation has been sent to before but have not accepted or rejected the invite, and are now specified for invitation again
  const preInvitedEmailsSetForInvite = [];
  // Emails that are not participants or pre-invited emails
  const invitableEmails = [];

  args.invitedEmails.forEach((email) => {
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

  // If there are no qualified emails to send messages to, return the function early.
  if (invitableEmails.length === 0) {
    const data = transformEvent(event._doc, context.user.id);
    return new SuccessResponse(200, true, data);
  }

  // get registered users whose email are present in the filtered list above
  const registeredUsers = await getUsersByEmail(invitableEmails);

  const registeredEmails = registeredUsers.map((user) => user.email);

  const unregisteredEmails = getUnregisteredEmails(
    registeredEmails,
    invitableEmails
  );

  const notificationPayload = registeredUsers.map((user) => {
    return {
      owner: user._id,
      initiator: context.user.id,
      type: 'Event Invite',
      message: `Invited you to an event. ${event.title}`,
      resourceType: 'Event',
      resourceId: event._id,
      isActionRequired: true,
      actionType: 'Accept or Decline Invitation',
      actionTaken: false,
    };
  });

  // Update invitations field
  invitableEmails.forEach((email) => {
    event.invitations.push({
      email: email,
      invitor: userId,
    });
  });

  // Update invited emails field
  event.invitedEmails.push(...invitableEmails);

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event____________________
    await event.save({ session });

    // Save in-app notification for each invited-registered-user____________________
    await Notification.create(notificationPayload, { session });

    // Increase notification count by 1 for each invited-registered-user________________
    await User.updateMany(
      { email: registeredEmails },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // From the user list above, get users with email notification turned on for events
  // Emails of registered users that have email notification turned on for (event invite)
  const registeredEmailRecipients = getRecipientsForEmailNotification(
    registeredUsers,
    'eventInvite'
  );

  const unregisteredEmailRecipients = unregisteredEmails.map((email) => ({
    email,
    timeZone: undefined,
  }));

  const emailRecipients = [
    ...registeredEmailRecipients,
    ...unregisteredEmailRecipients,
  ];

  if (emailRecipients.length > 0) {
    // Send invitations via email____________________
    await sendEmailForEventInvitation({
      emailRecipients,
      eventName: event.title,
      initiator: username || 'An anonymous user',
      date: event.date,
    });
  }

  // From the user list above, get users with push notification turned on for events
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

  const data = transformEvent(event._doc, context.user.id);
  return new SuccessResponse(200, true, data);
});
// @desc Invitee accepts an invitation
// @type MUTATION
// @access Private
module.exports.acceptInvitation = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo subscriptionInfo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Confirm that the logged-in user was invited to the event__________________
  if (event.invitedEmails.indexOf(context.user.email) === -1) {
    return new ErrorResponse(403, 'You have not been invited to this event.');
  }

  const inviteeCount = event.invitees.length;
  const eventOwner = event.owner;

  if (inviteeCount >= 5) {
    const subscriptionInfo = eventOwner.subscriptionInfo;

    const isFreeOrPremium = isUserFreeOrPremium(subscriptionInfo);

    if (isFreeOrPremium === false) {
      await sendSingleEmail({
        email: eventOwner.email,
        message:
          'Your event cannot host more than 5 invitees. An invitee just tried joining but was unable to. Please upgrade to a premium plan.',
        subject: `${event.title} can't host any more invitees`,
      });

      return new ErrorResponse(
        403,
        'Only 5 people can join this event. Please contact the event owner to increase the join limit.'
      );
    }
  }

  // Get the invited user information
  const invitee = await User.findById(context.user.id).select(
    'name email photo'
  );
  const role = 'Viewer';

  const invitorId =
    event.invitations.find(
      (invitation) => invitation.email === context.user.email
    )?.invitor || event.owner._id;

  // Update necessary fields
  event.invitees.push(invitee._id);
  event.inviteeRoles.push({ id: invitee._id, role });

  // Remove the user's email from the invited emails list
  event.invitedEmails = event.invitedEmails.filter(
    (email) => email !== context.user.email
  );

  // Remove the user's record from the invitations list
  event.invitations = event.invitations.filter(
    (invitation) => invitation.email !== context.user.email
  );

  const notificationPayload = {
    initiator: invitee._id,
    owner: invitorId,
    type: 'Event Invitation Accepted',
    message: `${invitee.name} accepted the invitation to ${event.title}`,
    resourceType: 'Event',
    resourceId: event._id,
  };

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event____________________
    await event.save({ session });

    // If the api was triggered in response to a notification, mark the actionTaken field of all related notifications as true
    if (args.viaNotification) {
      await Notification.updateMany(
        {
          owner: context.user.id,
          resourceId: event._id,
          resourceType: 'Event',
          type: 'Event Invite',
        },
        { actionTaken: true, clicked: true },
        { session }
      );
    }
    // Save invite-notification for the event owner and admins____________________
    await Notification.create([notificationPayload], { session });

    // Increase notification count by 1 for the event owner and event admins________________
    await User.updateOne(
      { _id: invitorId },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Handle Email and Push notifications
  const eventUsers = await User.find({ _id: invitorId });

  // Handle email notification
  const emailRecipients = getRecipientsForEmailNotification(
    eventUsers,
    'eventInvitationAcceptance'
  );

  // Send email notifications
  if (emailRecipients.length > 0) {
    await sendEmailForEventInviteAcceptance({
      emailRecipients,
      eventName: event.title,
      inviteeName: invitee.name || 'An anonymous user',
      date: event.date,
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    eventUsers,
    'eventInvitationAcceptance'
  );

  const type = 'Event Invitation Accepted';
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForEventInviteAcceptance({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      inviteeName: invitee.name || 'An anonymous user',
    });
  }

  const data = transformEvent(event._doc, context.user.id);
  return new SuccessResponse(200, true, data);
});

// @desc Invitee rejects an invitation
// @type MUTATION
// @access Private
module.exports.rejectInvitation = asyncHandler(async (_, args, context) => {
  const username = context.user.name;
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Confirm that the logged-in user was invited to the event__________________
  if (event.invitedEmails.indexOf(context.user.email) === -1) {
    return new ErrorResponse(403, 'You have not been invited to this event.');
  }

  const invitorId =
    event.invitations.find(
      (invitation) => invitation.email === context.user.email
    )?.invitor || event.owner._id;

  // Remove the user's email from the invited emails list
  event.invitedEmails = event.invitedEmails.filter(
    (email) => email !== context.user.email
  );

  // Remove the user's record from the invitations list
  event.invitations = event.invitations.filter(
    (invitation) => invitation.email !== context.user.email
  );

  const notificationPayload = {
    initiator: context.user.id,
    owner: invitorId,
    type: 'Event Invitation Rejected',
    message: `${username} rejected the invitation to ${event.title}`,
    resourceType: 'Event',
    resourceId: event._id,
  };

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event____________________
    await event.save({ session });

    // If this action was triggered in response to a notification, mark the actionTaken field as true
    if (args.viaNotification) {
      await Notification.updateMany(
        {
          owner: context.user.id,
          resourceId: event._id,
          resourceType: 'Event',
          type: 'Event Invite',
        },
        { actionTaken: true, clicked: true },
        { session }
      );
    }
    // Save invite-notification for the event owner____________________
    await Notification.create([notificationPayload], { session });

    // Increase notification count by 1 for the event owner and admins________________
    await User.updateOne(
      { _id: invitorId },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Handle Email and Push notifications
  const eventUsers = await User.find({ _id: invitorId });

  // Handle email notification
  const emailRecipients = getRecipientsForEmailNotification(
    eventUsers,
    'eventInvitationRejection'
  );

  // Send email notifications
  if (emailRecipients.length > 0) {
    await sendEmailForEventInviteRejection({
      emailRecipients,
      eventName: event.title,
      inviteeName: username || 'An anonymous user',
      date: event.date,
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    eventUsers,
    'eventInvitationRejection'
  );

  const type = 'Event Invitation Rejected';
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForEventInviteRejection({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      inviteeName: username || 'An anonymous user',
    });
  }

  const data = transformEvent(event._doc, context.user.id);
  return new SuccessResponse(200, true, data);
});

// @desc Accepts invitation to an event through invite link
// @type MUTATION
// @access Private
module.exports.acceptInvitationViaInviteLink = asyncHandler(
  async (_, args, context) => {
    const event = await Event.findById(args.id)
      .populate('owner', 'name email photo subscriptionInfo')
      .populate('invitees', 'name email photo');

    if (!event) {
      return new ErrorResponse(404, 'Event not found.');
    }

    const inviteeCount = event.invitees.length;
    const eventOwner = event.owner;

    if (inviteeCount >= 5) {
      const subscriptionInfo = eventOwner.subscriptionInfo;

      const isFreeOrPremium = isUserFreeOrPremium(subscriptionInfo);

      if (isFreeOrPremium === false) {
        await sendSingleEmail({
          email: eventOwner.email,
          message:
            'Your event cannot host more than 5 invitees. An invitee just tried joining but was unable to. Please upgrade to a premium plan.',
          subject: `${event.title} can't host any more invitees`,
        });

        return new ErrorResponse(
          403,
          'Only 5 people can join this event. Please contact the event owner to increase the join limit.'
        );
      }
    }

    const userId = context.user.id;
    const userEmail = context.user.email;
    const username = context.user.name;
    const invitorId = event.owner._id;
    const role = 'Viewer';

    const participantEmails = getEventParticipantEmails(event);

    if (participantEmails.indexOf(context.user.email) !== -1) {
      return new ErrorResponse(400, 'You are already a member of this event.');
    }

    // Update necessary fields
    event.invitees.push(userId);
    event.inviteeRoles.push({ id: userId, role });

    event.invitedEmails = event.invitedEmails.filter(
      (email) => email !== userEmail
    );

    event.invitations = event.invitations.filter(
      (invitation) => invitation.email !== userEmail
    );

    const notificationPayload = {
      initiator: userId,
      owner: invitorId,
      type: 'Event Invitation Accepted',
      message: `${username} accepted the invitation to ${event.title}; through invitation link`,
      resourceType: 'Event',
      resourceId: event._id,
    };

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // Update the event____________________
      await event.save({ session });

      // Save invite-notification for the event owner____________________
      await Notification.create([notificationPayload], { session });

      // Increase notification count by 1 for the event owner and event admins________________
      await User.updateOne(
        { _id: invitorId },
        { $inc: { newNotifications: 1, unreadNotifications: 1 } },
        { session }
      );
    });

    session.endSession();

    const data = transformEvent(event._doc, userId);
    return new SuccessResponse(200, true, data);
  }
);

// @desc Reject invitation to an event through invite link
// @type MUTATION
// @access Private
module.exports.rejectInvitationViaInviteLink = asyncHandler(
  async (_, args, context) => {
    const event = await Event.findById(args.id)
      .populate('owner', 'name email photo')
      .populate('invitees', 'name email photo');

    if (!event) {
      return new ErrorResponse(404, 'Event not found.');
    }

    const userId = context.user.id;
    const userEmail = context.user.email;

    const participantEmails = getEventParticipantEmails(event);

    if (participantEmails.indexOf(userEmail) !== -1) {
      return new ErrorResponse(400, 'You are already a member of this event.');
    }

    // Update necessary fields

    event.invitedEmails = event.invitedEmails.filter(
      (email) => email !== userEmail
    ); // update 3

    event.invitations = event.invitations.filter(
      (invitation) => invitation.email !== userEmail
    ); // update 4

    await event.save();

    const data = transformEvent(event._doc, userId);
    return new SuccessResponse(200, true, data);
  }
);

// @desc Remove an invitee from an event
// @type MUTATION
// @access Private
module.exports.removeInvitee = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission(
    'removeInviteeFromEvent',
    context.user.id,
    event
  );

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to remove users.');
  }

  // Confirm that the logged-in user is not trying to remove himself
  if (args.inviteeId === context.user.id.toString()) {
    return new ErrorResponse(403, 'You cannot remove yourself.');
  }
  // Confirm that inviteeId belongs to an actual invitee in the event
  if (
    !event.invitees.find((invitee) => invitee._id.toString() === args.inviteeId)
  ) {
    return new ErrorResponse(
      400,
      `InviteeId: ${args.inviteeId} does not match any invitee`
    );
  }

  // If the executor is an invitee, check that he is not trying to remove another invitee that has a higher or equal role
  if (permission.userType === 'Invitee') {
    // Role of the executor who is trying to remove another invitee
    const executorRole = event.inviteeRoles.find(
      (role) => role.id.toString() === permission.executor
    )?.role;

    // Role of the invitee who is about to be removed
    const executeeRole = event.inviteeRoles.find(
      (role) => role.id.toString() === args.inviteeId
    )?.role;

    if (executorRole === 'Editor' && executeeRole === 'Admin') {
      return new ErrorResponse(
        403,
        'You can only remove users who are Viewers'
      );
    }

    if (executorRole === 'Admin' && executeeRole === 'Admin') {
      return new ErrorResponse(
        403,
        'You can only remove users who are Editors or Viewers'
      );
    }

    if (executorRole === 'Editor' && executeeRole === 'Editor') {
      return new ErrorResponse(
        403,
        'You can only remove users who are Viewers'
      );
    }
  }

  const inviteeRoles = event.inviteeRoles;
  // Remove the invitee from the list of invitees and the invitee roles
  event.invitees = event.invitees.filter(
    (invitee) => invitee._id.toString() !== args.inviteeId
  );
  event.inviteeRoles = inviteeRoles.filter(
    (inviteeRole) => inviteeRole.id.toString() !== args.inviteeId
  );

  const notificationPayload = {
    initiator: context.user.id,
    owner: args.inviteeId,
    type: 'Invitee Removal',
    message: `You were removed from the event: ${event.title}`,
    resourceType: 'Event',
    resourceId: event._id,
  };

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event____________________
    await event.save({ session });

    // Save invite-notification for the removed invitee____________________
    await Notification.create([notificationPayload], { session });

    // Increase notification count by 1 for the removed invitee________________
    await User.updateOne(
      { _id: args.inviteeId },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });

  session.endSession();

  const invitee = await User.findById(args.inviteeId);

  // Handle email notification
  const notifiableEmails = getNotifiableEmails([invitee], 'inviteeRemoved');

  // Send email notifications
  if (notifiableEmails.length > 0) {
    await sendEmailForInviteeRemoval({
      emails: notifiableEmails,
      eventName: event.title,
      initiator: context.user.name,
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    [invitee],
    'inviteeRemoved'
  );

  const type = 'Invitee Removal';
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForInviteeRemoval({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
    });
  }

  // Prepare response
  const data = invitee._doc;
  data.role = inviteeRoles.find(
    (inviteeRole) => inviteeRole.id.toString() === args.inviteeId
  ).role;

  data.id = data._id;
  return new SuccessResponse(200, true, data);
});

// @desc Assign role to an invitee
// @type MUTATION
// @access Private
module.exports.assignRoleToInvitee = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  const inviteeId = args.inviteeId;
  // Handle Permissions
  const permission = checkPermission('assignEventRole', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You cannot assign roles.');
  }

  // Confirm that the user is not trying to assign role to himself
  if (inviteeId === context.user.id.toString()) {
    return new ErrorResponse(403, 'You cannot assign role to yourself.');
  }
  // Confirm that inviteeId belongs to an actual invitee in the event
  if (isInvitee(inviteeId, event) === false) {
    return new ErrorResponse(
      400,
      `InviteeId: ${inviteeId} does not match any invitee`
    );
  }

  // Make sure that invitees can only assign role to members with a lower role
  if (permission.userType === 'Invitee') {
    const executorRole = event.inviteeRoles.find(
      (role) => role.id.toString() === permission.executor
    )?.role;

    // Role of the invitee to assign role to
    const executeeRole = event.inviteeRoles.find(
      (role) => role.id.toString() === inviteeId
    )?.role;

    if (executorRole === 'Admin' && executeeRole === 'Admin') {
      return new ErrorResponse(
        403,
        'You can only assign role to event Editors and Viewers'
      );
    }
  }

  // Assign role to the invitee
  event.inviteeRoles = event.inviteeRoles.map((inviteeRole) => {
    if (inviteeRole.id.toString() === inviteeId) {
      inviteeRole.role = args.role;
    }

    return inviteeRole;
  });

  const notificationPayload = {
    initiator: context.user.id,
    owner: args.inviteeId,
    type: 'Invitee Role Assigned',
    message: `${args.role} Role was assigned to you on the event: ${event.title}`,
    resourceType: 'Event',
    resourceId: event._id,
  };

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event____________________
    await event.save({ session });

    // Save invite notification for the removed invitee____________________
    await Notification.create([notificationPayload], { session });

    // Increase notification count by 1 for the removed invitee________________
    await User.updateOne(
      { _id: args.inviteeId },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Prepare response data
  const invitee = await User.findById(inviteeId);

  // Handle email notification
  const notifiableEmails = getNotifiableEmails([invitee], 'eventRoleAssigned');

  // Send email notifications
  if (notifiableEmails.length > 0) {
    await sendEmailForEventRoleAssigned({
      emails: notifiableEmails,
      eventName: event.title,
      role: args.role,
      initiator: context.user.name,
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    [invitee],
    'eventRoleAssigned'
  );

  const type = 'Invitee Role Assigned';
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForEventRoleAssigned({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      role: args.role,
    });
  }

  const data = invitee._doc;
  data.role = args.role;
  data.id = data._id;
  return new SuccessResponse(200, true, data);
});

// @desc Add a todo to an event
// @type MUTATION
// @access Private
module.exports.addTodo = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('addTodo', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to add todos.');
  }

  const newTodo = {
    title: args.title,
    note: args.note,
    isCompleted: args.isCompleted,
  };
  const notificationPayload = permission.notifHosts.map((user) => {
    return {
      owner: user,
      initiator: context.user.id,
      type: 'Todo Added',
      message: `Added a Todo. ${args.title}`,
      resourceType: 'Event',
      resourceId: event._id,
      isActionRequired: false,
    };
  });

  // Add updates to event (add todo to the list of todos, increase todoCount)
  event.todos.push(newTodo);

  event.todoCount = event.todoCount + 1;

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });

    // Save todo-add-notification to event participants
    await Notification.create(notificationPayload, { session });

    // Increase notification count by 1 for each invited-registered-user
    await User.updateMany(
      { _id: permission.notifHosts },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Handle notifications
  const notifUsers = await User.find({ _id: permission.notifHosts });

  const notifNarration = 'todoAdded';
  const notifType = 'Todo Added';

  const notifiableEmails = getNotifiableEmails(notifUsers, notifNarration);

  // Send email notifications
  if (notifiableEmails.length > 0) {
    await sendEmailForTodoAdded({
      emails: notifiableEmails,
      eventName: event.title,
      todoTitle: newTodo.title,
      initiator: context.user.name,
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    notifUsers,
    notifNarration
  );

  const type = notifType;
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForTodoAdded({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      todoTitle: newTodo.title,
    });
  }

  return new SuccessResponse(200, true, event.todos[event.todos.length - 1]);
});

// @desc Edit a todo of an event
// @type MUTATION
// @access Private
module.exports.editTodo = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('editTodo', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to edit todos.');
  }

  // Add updates to event (Edit the todo)
  const todoToEdit = event.todos.find(
    (todo) => todo._id.toString() === args.todoId
  );

  if (!todoToEdit) {
    return new ErrorResponse(404, 'Todo does not exist.');
  }

  event.todos = event.todos.map((todo) => {
    if (todo._id.toString() === todoToEdit._id.toString()) {
      todo.title = args.title;
      todo.note = args.note;
      todo.isCompleted = args.isCompleted;
    }

    return todo;
  });

  const notificationPayload = permission.notifHosts.map((user) => {
    return {
      owner: user,
      initiator: context.user.id,
      type: 'Todo Edited',
      message: `Edited a Todo. ${todoToEdit.title}`,
      resourceType: 'Event',
      resourceId: event._id,
      isActionRequired: false,
    };
  });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });

    // Save todo-add-notification to event participants
    await Notification.create(notificationPayload, { session });

    // Increase notification count by 1 for each invited-registered-user
    await User.updateMany(
      { _id: permission.notifHosts },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Handle notifications
  const notifUsers = await User.find({ _id: permission.notifHosts });

  const notifNarration = 'todoEdited';
  const notifType = 'Todo Edited';

  const notifiableEmails = getNotifiableEmails(notifUsers, notifNarration);

  // Send email notifications
  if (notifiableEmails.length > 0) {
    await sendEmailForTodoEdited({
      emails: notifiableEmails,
      eventName: event.title,
      todoTitle: todoToEdit.title,
      initiator: context.user.name,
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    notifUsers,
    notifNarration
  );

  const type = notifType;
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForTodoEdited({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      todoTitle: todoToEdit.title,
    });
  }

  return new SuccessResponse(
    200,
    true,
    event.todos.find((todo) => todo._id.toString() === args.todoId)
  );
});

// @desc Delete a todo from an event
// @type MUTATION
// @access Private
module.exports.deleteTodo = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('deleteTodo', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to remove todos.');
  }

  // Add updates to event (Remove the event and decrease todoCount)
  const todoToRemove = event.todos.find(
    (todo) => todo._id.toString() === args.todoId
  );

  if (!todoToRemove) {
    return new ErrorResponse(404, 'Todo does not exist.');
  }

  event.todos = event.todos.filter(
    (todo) => todo._id.toString() !== todoToRemove._id.toString()
  );
  event.todoCount = event.todoCount - 1;

  const notificationPayload = permission.notifHosts.map((user) => {
    return {
      owner: user,
      initiator: context.user.id,
      type: 'Todo Deleted',
      message: `Deleted a Todo. ${todoToRemove.title}`,
      resourceType: 'Event',
      resourceId: event._id,
      isActionRequired: false,
    };
  });
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });

    // Save todo-add-notification to event participants
    await Notification.create(notificationPayload, { session });

    // Increase notification count by 1 for each invited-registered-user
    await User.updateMany(
      { _id: permission.notifHosts },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Handle notifications
  const notifUsers = await User.find({ _id: permission.notifHosts });

  const notifNarration = 'todoDeleted';
  const notifType = 'Todo Deleted';

  const notifiableEmails = getNotifiableEmails(notifUsers, notifNarration);

  // Send email notifications
  if (notifiableEmails.length > 0) {
    await sendEmailForTodoDeleted({
      emails: notifiableEmails,
      eventName: event.title,
      todoTitle: todoToRemove.title,
      initiator: context.user.name,
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    notifUsers,
    notifNarration
  );
  console.log(notifiableDevices, 'notifiableDevices');

  const type = notifType;
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForTodoDeleted({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      todoTitle: todoToRemove.title,
    });
  }

  return new SuccessResponse(200, true, todoToRemove);
});

// @desc Duplicate a todo in an event
// @type MUTATION
// @access Private
module.exports.duplicateTodo = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('addTodo', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to duplicate todos.');
  }

  const todoToDuplicateIndex = event.todos.findIndex(
    (todo) => todo._id.toString() === args.todoId
  );

  if (todoToDuplicateIndex === -1) {
    return new ErrorResponse(404, 'Todo does not exist.');
  }

  const todoToDuplicate = event.todos[todoToDuplicateIndex];

  event.todos.splice(todoToDuplicateIndex + 1, 0, {
    title: todoToDuplicate.title,
    note: todoToDuplicate.note,
    isCompleted: todoToDuplicate.isCompleted,
  });

  event.todoCount = event.todoCount + 1;

  // Create notification Payload
  const notificationObj = {
    initiator: context.user.id,
    type: 'Todo Duplicated',
    message: `Duplicated a Todo. ${todoToDuplicate.title}`,
    resourceType: 'Event',
    resourceId: event._id,
    isActionRequired: false,
  };

  const notificationPayload = permission.notifHosts.map((user) => {
    return {
      owner: user,
      ...notificationObj,
    };
  });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });

    // Save todo-add-notification to event participants
    await Notification.create(notificationPayload, { session });

    // Increase notification count by 1 for each invited-registered-user
    await User.updateMany(
      { _id: permission.notifHosts },
      { $inc: { newNotifications: 1, unreadNotifications: 1 } },
      { session }
    );
  });
  session.endSession();

  // Handle notifications
  const notifUsers = await User.find({ _id: permission.notifHosts });

  const notifNarration = 'todoAdded';
  const notifType = 'Todo Added';

  const notifiableEmails = getNotifiableEmails(notifUsers, notifNarration);

  // Send email notifications
  if (notifiableEmails.length > 0) {
    await sendEmailForTodoAdded({
      emails: notifiableEmails,
      eventName: event.title,
      todoTitle: todoToDuplicate.title,
      initiator: context.user.name || 'A participant',
    });
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    notifUsers,
    notifNarration
  );

  const type = notifType;
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    await sendPushNotificationForTodoAdded({
      type,
      resourceType,
      resourceId,
      devices: notifiableDevices,
      eventName: event.title,
      todoTitle: todoToDuplicate.title,
    });
  }

  return new SuccessResponse(200, true, event.todos[todoToDuplicateIndex + 1]);
});

// @desc Mark a todo as completed or not
// @type MUTATION
// @access Private
module.exports.markTodo = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('markTodo', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to mark todos.');
  }

  // Add updates to event (Edit the todo)
  const todoToEdit = event.todos.find(
    (todo) => todo._id.toString() === args.todoId
  );

  if (!todoToEdit) {
    return new ErrorResponse(404, 'Todo does not exist.');
  }

  const sendNotification = todoToEdit.isCompleted !== args.isCompleted;

  event.todos = event.todos.map((todo) => {
    if (todo._id.toString() === todoToEdit._id.toString()) {
      todo.isCompleted = args.isCompleted;
    }

    return todo;
  });

  // Create notification Payload
  const narration = args.isCompleted ? 'Completed' : 'Unmarked';
  const notificationObj = {
    initiator: context.user.id,
    type: `Todo ${narration}`,
    message: `${narration} a Todo. ${todoToEdit.title}`,
    resourceType: 'Event',
    resourceId: event._id,
    isActionRequired: false,
  };

  const notificationPayload = permission.notifHosts.map((user) => {
    return {
      owner: user,
      ...notificationObj,
    };
  });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });

    // Only send notifications if todo's completion status changes

    if (sendNotification) {
      // Save todo-add-notification to event participants
      await Notification.create(notificationPayload, { session });

      // Increase notification count by 1 for each invited-registered-user
      await User.updateMany(
        { _id: permission.notifHosts },
        { $inc: { newNotifications: 1, unreadNotifications: 1 } },
        { session }
      );
    }
  });
  session.endSession();

  // Handle notifications
  const notifUsers = await User.find({ _id: permission.notifHosts });
  const notifNarration =
    args.isCompleted === true ? 'todoCompleted' : 'todoUnmarked';

  const notifType =
    args.isCompleted === true ? 'Todo Completed' : 'Todo Unmarked';

  const notifiableEmails = getNotifiableEmails(notifUsers, notifNarration);

  // Send email notifications
  if (notifiableEmails.length > 0) {
    if (notifNarration === 'todoCompleted') {
      await sendEmailForTodoCompleted({
        emails: notifiableEmails,
        eventName: event.title,
        todoTitle: todoToEdit.title,
        initiator: context.user.name,
      });
    } else {
      await sendEmailForTodoUnmarked({
        emails: notifiableEmails,
        eventName: event.title,
        todoTitle: todoToEdit.title,
        initiator: context.user.name,
      });
    }
  }

  // Handle push notifications
  const notifiableDevices = await getNotifiableDevices(
    notifUsers,
    notifNarration
  );

  const type = notifType;
  const resourceType = 'Event';
  const resourceId = event._id;
  // Send push notifications
  if (notifiableDevices.length > 0) {
    if (notifNarration === 'todoCompleted') {
      await sendPushNotificationForTodoCompleted({
        type,
        resourceType,
        resourceId,
        devices: notifiableDevices,
        eventName: event.title,
        todoTitle: todoToEdit.title,
      });
    } else {
      await sendPushNotificationForTodoUnmarked({
        type,
        resourceType,
        resourceId,
        devices: notifiableDevices,
        eventName: event.title,
        todoTitle: todoToEdit.title,
      });
    }
  }

  return new SuccessResponse(
    200,
    true,
    event.todos.find((todo) => todo._id.toString() === args.todoId)
  );
});

// @desc Add a routine to an event
// @type MUTATION
// @access Private
module.exports.addRoutine = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('addRoutine', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to add routines.');
  }

  // extract routine data
  const newRoutine = { ...args.input };

  // add updates to event (add routine to the list of routines, increase routineCount)
  event.routines.push(newRoutine);
  event.routineCount += 1;

  // get max email routines
  const maxEmailRoutines = parseInt(process.env.EVENT_EMAIL_ROUTINE_MAX, 10);
  // count routine(s)
  if (event.routineCount > maxEmailRoutines) {
    // get email rorutines
    const emailRoutines = event.routines.filter(
      (e) => e.routineType == 'email'
    );
    // check that email routines aren't more than set number
    if (emailRoutines.length > maxEmailRoutines) {
      return new ErrorResponse(
        400,
        `You cannot add more than ${maxEmailRoutines} email routines.`
      );
    }
  }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });
  });
  session.endSession();

  return new SuccessResponse(
    200,
    true,
    event.routines[event.routines.length - 1]
  );
});

// @desc Edit an event routine
// @type MUTATION
// @access Private
module.exports.editRoutine = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('editRoutine', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to edit routines.');
  }

  // get the routine index
  let index;

  // check that routine exists
  if (
    (index = event.routines.findIndex(
      (r) => r._id.toString() == args.routineId
    )) < 0
  ) {
    return new ErrorResponse(404, 'Routine does not exist.');
  }

  // get routine
  let routine = event.routines[index];

  // update routine
  event.routines[index] = {
    ...routine,
    ...args.input,
    _id: routine._id,
  };

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });
  });
  session.endSession();

  return new SuccessResponse(200, true, routine);
});

// @desc Delete a routine from an event
// @type MUTATION
// @access Private
module.exports.deleteRoutine = asyncHandler(async (_, args, context) => {
  // Get the event___________________
  const event = await Event.findById(args.id)
    .populate('owner', 'name email photo')
    .populate('invitees', 'name email photo');

  if (!event) {
    return new ErrorResponse(404, 'Event not found.');
  }

  // Handle Permissions
  const permission = checkPermission('deleteRoutine', context.user.id, event);

  if (!permission.hasPermission) {
    return new ErrorResponse(403, 'You are not authorized to remove routines.');
  }

  // get index
  let index;

  if (
    (index = event.routines.findIndex(
      (r) => r._id.toString() == args.routineId
    )) < 0
  ) {
    return new ErrorResponse(404, 'Routine does not exist.');
  }

  // get routine
  const routine = event.routines[index];
  // delete routine and reduce count
  event.routines.splice(index, 1);
  event.routineCount -= 1;

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // Update the event__________________
    await event.save({ session });
  });
  session.endSession();

  return new SuccessResponse(200, true, routine);
});


