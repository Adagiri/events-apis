const {
  subWeeks,
  subDays,
  subHours,
  subMinutes,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  addMinutes,
} = require('date-fns');
const LoginSession = require('../../models/LoginSession');
const User = require('../../models/User');

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

module.exports.isUserFreeOrPremium = (subscriptionInfo) => {
  const isPremiumActive = checkIfPremiumIsActive(subscriptionInfo);
  const isFreeTrialActive = checkIfFreeTrialIsActive(subscriptionInfo);

  if (isPremiumActive || isFreeTrialActive) {
    return true;
  }

  return false;
};

const emailExist = (email, emailList) => {
  return emailList.indexOf(email) !== -1;
};

module.exports.getEventParticipantEmails = (event) => {
  const emails = [];

  emails.push(event.owner.email);

  event.invitees.forEach((invitee) => {
    emails.push(invitee.email);
  });

  return emails;
};

module.exports.getUnregisteredEmails = (registeredEmails, invitableEmails) => {
  return invitableEmails.filter(
    (email) => emailExist(email, registeredEmails) === false
  );
};

module.exports.getNotifiableEmails = (registeredUsers, scenerio) => {
  return registeredUsers
    .filter((user) => user.emailNotifSettings[scenerio] === true)
    .map((user) => user.email);
};

module.exports.getRecipientsForEmailNotification = (
  registeredUsers,
  scenerio
) => {
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
module.exports.getNotifiableDevices = async (registeredUsers, scenerio) => {
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
module.exports.getUsersByEmail = async (emails) => {
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

module.exports.transformEvent = (event, loggedInUserId) => {
  const inviteeRoles = event.inviteeRoles;

  event.invitees = event.invitees.map((invitee) => {
    
    if (invitee === null) {
      return undefined;
    }

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
  event.owner.id = event.owner._id;
  event.id = event._id;

  return event;
};

module.exports.checkPermission = (operation, userId, event) => {
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
};

module.exports.isEventOwner = (event, userId) => {
  if (event.owner._id.toString() === userId.toString()) {
    return true;
  } else {
    return false;
  }
};

module.exports.isInvitee = (inviteeId, event) => {
  return (
    event.invitees.findIndex(
      (invitee) => invitee._id.toString() === inviteeId
    ) !== -1
  );
};

module.exports.deriveReminderTime = ({
  eventStartDate,
  reminderUnit,
  reminderNumber,
}) => {
  const date = new Date(eventStartDate);
  if (reminderUnit === 'week') {
    return subWeeks(date, reminderNumber);
  }
  if (reminderUnit === 'day') {
    return subDays(date, reminderNumber);
  }
  if (reminderUnit === 'hour') {
    return subHours(date, reminderNumber);
  }
  return subMinutes(date, reminderNumber);
};

module.exports.deriveNextRepetitionDate = ({ endDate }) => {
  const oneMinuteAfterEndDate = addMinutes(new Date(endDate), 1);
  return oneMinuteAfterEndDate;
};

module.exports.getLoggedInUserRoleInEvent = getLoggedInUserRoleInEvent;
module.exports.checkIfPremiumIsActive = checkIfPremiumIsActive;
module.exports.checkIfFreeTrialIsActive = checkIfFreeTrialIsActive;
module.exports.emailExist = emailExist;
