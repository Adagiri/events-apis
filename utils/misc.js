const {
  sendEmail,
  createEmailParam,
  sendPushNotifications,
  createCustomEmailParam,
} = require('./notifications');
const sendSMS = require('./notifications-sms');
const Event = require('../models/Event');
const { deleteS3File } = require('../services/AwsService');
const { errors } = require('./errorCodeMap');
const templateParser = require('./templateParser');

module.exports.getUniqueElements = (arr, uniqueKey = 'id') => {
  const idSet = new Set();
  const uniqueElements = [];

  for (const element of arr) {
    if (!idSet.has(element[uniqueKey])) {
      // If the id is unique, add it to the result array and the set.
      idSet.add(element[uniqueKey]);
      uniqueElements.push(element);
    }
  }

  return uniqueElements;
};

// dress email with general template
const dressEmailAsGeneral = async function (
  email,
  subject,
  message,
  asTemplate = false
) {
  // get template
  let template = await templateParser('general.html', {
    host: templateParser.host(),
    subject,
    message,
  });

  // check if function should return just template or follow through
  if (asTemplate) return template;

  // adjust email
  email = Array.isArray(email) ? [...email] : [email];

  // check if template processing was successful
  if (template) return createEmailParam(null, email, subject, template);
  return createEmailParam(null, email, subject, message);
};

module.exports.randomNumbers = (length) => {
  let code = '';
  while (code.length < length) {
    code += Math.floor(Math.random() * (9 - 1 + 1)) + 1;
  }

  return code;
};

module.exports.generateNewInviteLinkId = async () => {
  // get the latest event
  const latestEvent = await Event.find()
    .limit(1)
    .sort({ _id: -1 })
    .select('inviteLinkId');
  console.log(latestEvent.inviteLinkId);
  const oldId = Number(latestEvent[0]?.inviteLinkId || 0);
  const newId = String(oldId + 1);

  let extraZeros = '';
  for (i = 0; i < 8 - newId.length; i++) {
    extraZeros += '0';
  }

  return extraZeros + newId;
};

// Emails
module.exports.sendSingleEmail = async ({ email, message, subject }) => {
  const params = await dressEmailAsGeneral(email, subject, message);

  await sendEmail(params);
};

// SMS
module.exports.sendTextMessage = async ({
  sender,
  recipient,
  content,
  event,
}) => {
  try {
    // send sms
    await sendSMS({ sender, recipient, content });
  } catch (err) {
    // console.error(err);
    // notify user about error
    let payload = {
      email: event.owner.email,
      message:
        `SMS failed when sending to ${recipient}` +
        (event ? `, for event '${event.title}'.` : '.'),
      subject: 'Event Routine SMS Failure',
    };
    
    // report-sms-failure
    // await sendEmail(
    //   await dressEmailAsGeneral(payload.email, payload.subject, payload.message)
    // );
  }
};

module.exports.sendEmailForEventReminder = async (emailRecipients) => {
  let recipients = [];
  for (let emailRecipient of emailRecipients) {
    const subject = emailRecipient.emailTitle;
    const email = emailRecipient.email;
    const body = await dressEmailAsGeneral(
      email,
      subject,
      emailRecipient.emailBody,
      true
    );

    recipients.push({ subject, body, email });
  }

  const params = createCustomEmailParam(recipients);
  await sendEmail(params);
};

module.exports.sendEmailForEventInvitation = async ({
  emailRecipients,
  eventName,
  initiator,
  date,
}) => {
  let recipients = [];
  for (let emailRecipient of emailRecipients) {
    const eventDate = date.toLocaleString('en-US', {
      timeZone: emailRecipient.timeZone,
    });

    const email = emailRecipient.email;
    const subject = `Event invitation to ${eventName}`;

    // get template
    let template = await templateParser('invitation.html', {
      host: templateParser.host(),
      date: eventDate,
      initiator,
      eventName,
    });

    const body = template;

    recipients.push({ subject, body, email });
  }

  const params = createCustomEmailParam(recipients);
  await sendEmail(params);
};

module.exports.sendEmailForEventDeletion = async ({
  emails,
  eventName,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `${eventName} Event deleted`,
    `${initiator} deleted ${eventName}`
  );

  await sendEmail(params);
};

module.exports.sendEmailForEventInviteAcceptance = async ({
  emailRecipients,
  eventName,
  inviteeName,
  date,
}) => {
  let recipients = [];
  for (let emailRecipient of emailRecipients) {
    const eventDate = date.toLocaleString('en-US', {
      timeZone: emailRecipient.timeZone,
    });

    const subject = `Event invitation accepted`;
    const email = emailRecipient.email;
    const body = await dressEmailAsGeneral(
      email,
      subject,
      `<span style="color: #ffffff">${inviteeName}</span> accepted your invitation to '<span style="color: #ffffff">${eventName}</span>' which takes place on <span style="color: #ffffff">${eventDate}</span>.`,
      true
    );

    recipients.push({ subject, body, email });
  }

  const params = createCustomEmailParam(recipients);
  await sendEmail(params);
};

module.exports.sendEmailForEventInviteRejection = async ({
  emailRecipients,
  eventName,
  inviteeName,
  date,
}) => {
  let recipients = [];
  for (let emailRecipient of emailRecipients) {
    const eventDate = date.toLocaleString('en-US', {
      timeZone: emailRecipient.timeZone,
    });

    const email = emailRecipient.email;
    const subject = `Event invitation declined`;
    const body = await dressEmailAsGeneral(
      email,
      subject,
      `<span style="color: #ffffff">${inviteeName}</span> declined your invitation to '<span style="color: #ffffff">${eventName}</span>' which takes place on <span style="color: #ffffff">${eventDate}</span>.`,
      true
    );

    recipients.push({ subject, body, email });
  }

  const params = createCustomEmailParam(recipients);
  await sendEmail(params);
};

module.exports.sendEmailForInviteeRemoval = async ({
  emails,
  eventName,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `Removal from ${eventName}`,
    `${initiator} just removed you from ${eventName}`
  );

  await sendEmail(params);
};

module.exports.sendEmailForEventRoleAssigned = async ({
  emails,
  eventName,
  role,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `${role} assigned to you`,
    `${initiator} just assigned you ${role} on ${eventName}`
  );

  await sendEmail(params);
};

module.exports.sendEmailForTodoCompleted = async ({
  emails,
  eventName,
  todoTitle,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `To-do item completed`,
    `${initiator} completed ${todoTitle} in ${eventName}`
  );

  await sendEmail(params);
};

module.exports.sendEmailForTodoUnmarked = async ({
  emails,
  eventName,
  todoTitle,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `To-do item uncompleted`,
    `${initiator} uncompleted ${todoTitle} in ${eventName}.`
  );

  await sendEmail(params);
};

module.exports.sendEmailForTodoAdded = async ({
  emails,
  eventName,
  todoTitle,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `To-do item added to ${eventName}`,
    `${initiator} added ${todoTitle} to ${eventName}`
  );

  await sendEmail(params);
};

module.exports.sendEmailForTodoEdited = async ({
  emails,
  eventName,
  todoTitle,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `To-do item edited`,
    `${initiator} edited ${todoTitle} in ${eventName}`
  );

  await sendEmail(params);
};

module.exports.sendEmailForTodoDeleted = async ({
  emails,
  eventName,
  todoTitle,
  initiator,
}) => {
  const params = await dressEmailAsGeneral(
    [...emails],
    `To-do item deleted`,
    `${initiator} deleted ${todoTitle} in ${eventName}`
  );

  await sendEmail(params);
};

// Notifications

module.exports.sendPushNotificationForEventReminder = async (recipients) => {
  console.log(recipients.length, 'notif');
  const type = 'Event Reminder';

  const messages = recipients.map((recipient) => {
    const {
      resourceType,
      resourceId,
      pushNotificationBody,
      pushNotificationTitle,
      deviceToken,
    } = recipient;

    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: pushNotificationTitle,
        body: pushNotificationBody,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: deviceToken,
    };
  });
  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForEventInvitation = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  initiator,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${initiator} is inviting you`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });
  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForEventDeletion = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `has been deleted`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForEventInviteAcceptance = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  inviteeName,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${inviteeName} accepted your invitation`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForEventInviteRejection = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  inviteeName,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${inviteeName} declined your invitation`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForInviteeRemoval = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `You were removed`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForEventRoleAssigned = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  role,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${role} was assigned to you`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForTodoCompleted = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  todoTitle,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${todoTitle} completed`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForTodoUnmarked = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  todoTitle,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${todoTitle} uncompleted`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForTodoAdded = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  todoTitle,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${todoTitle} added`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForTodoEdited = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  todoTitle,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${todoTitle} Edited`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.sendPushNotificationForTodoDeleted = async ({
  type,
  resourceType,
  resourceId,
  devices,
  eventName,
  todoTitle,
}) => {
  const messages = devices.map((device) => {
    return {
      data: {
        type,
        resourceType,
        resourceId: String(resourceId),
      },
      notification: {
        title: `${eventName}`,
        body: `${todoTitle} deleted`,
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.caf',
          },
        },
      },
      token: device,
    };
  });

  await sendPushNotifications(messages);
};

module.exports.deleteOldFile = async (photo) => {
  const MEDIA_URL_PREFIX = process.env.MEDIA_URL_PREFIX;
  console.log(photo);
  if (
    photo === null ||
    (typeof photo === 'string' && photo.startsWith(MEDIA_URL_PREFIX) === false)
  ) {
    return;
  } else {
    const BUCKET = process.env.AWS_S3_FILEUPLOAD_BUCKET;
    const key = photo.split(`${MEDIA_URL_PREFIX}/`)[1];
    await deleteS3File(key, BUCKET);
  }
};

module.exports.isPremiumUser = async () => {};
