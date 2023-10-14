const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const asyncHandler = require('../middleware/async');
const User = require('../models/User');
const { sendEmail, createEmailParam } = require('../utils/notifications');
const { ErrorResponse, SuccessResponse } = require('../utils/responses');
const UserChangeEmail = require('../models/UserChangeEmail');
const LoginSession = require('../models/LoginSession');
const { deleteS3File } = require('../services/AwsService');
const { deleteOldFile } = require('../utils/misc');
const { errors } = require('../utils/errorCodeMap');
const templateParser = require('../utils/templateParser');

const generateEditNotificationUpdates = ({
  pushNotifEventInvite,
  pushNotifEventDelete,
  pushNotifEventInvitationAcceptance,
  pushNotifEventInvitationRejection,
  pushNotifInviteeRemoved,
  pushNotifEventRoleAssigned,
  pushNotifTodoCompleted,
  pushNotifTodoUnmarked,
  pushNotifTodoAdded,
  pushNotifTodoEdited,
  pushNotifTodoDeleted,
  pushNotifDirectMessaging,
  // Email notif fields
  emailNotifEventInvite,
  emailNotifEventDelete,
  emailNotifEventInvitationAcceptance,
  emailNotifEventInvitationRejection,
  emailNotifInviteeRemoved,
  emailNotifEventRoleAssigned,
  emailNotifTodoCompleted,
  emailNotifTodoUnmarked,
  emailNotifTodoAdded,
  emailNotifTodoEdited,
  emailNotifTodoDeleted,
  emailNotifDirectMessaging,
  // Newsletter fields
  newsLetterFeaturesAnnouncement,
  newsLetterAnnouncementAndOffers,
}) => {
  const updates = {
    pushNotifSettings: {
      eventInvite: pushNotifEventInvite,
      eventDelete: pushNotifEventDelete,
      eventInvitationAcceptance: pushNotifEventInvitationAcceptance,
      eventInvitationRejection: pushNotifEventInvitationRejection,
      inviteeRemoved: pushNotifInviteeRemoved,
      eventRoleAssigned: pushNotifEventRoleAssigned,
      todoCompleted: pushNotifTodoCompleted,
      todoUnmarked: pushNotifTodoUnmarked,
      todoAdded: pushNotifTodoAdded,
      todoEdited: pushNotifTodoEdited,
      todoDeleted: pushNotifTodoDeleted,
      directMessaging: pushNotifDirectMessaging,
    },
    emailNotifSettings: {
      eventInvite: emailNotifEventInvite,
      eventDelete: emailNotifEventDelete,
      eventInvitationAcceptance: emailNotifEventInvitationAcceptance,
      eventInvitationRejection: emailNotifEventInvitationRejection,
      inviteeRemoved: emailNotifInviteeRemoved,
      eventRoleAssigned: emailNotifEventRoleAssigned,
      todoCompleted: emailNotifTodoCompleted,
      todoUnmarked: emailNotifTodoUnmarked,
      todoAdded: emailNotifTodoAdded,
      todoEdited: emailNotifTodoEdited,
      todoDeleted: emailNotifTodoDeleted,
      directMessaging: emailNotifDirectMessaging,
    },
    newsletterSettings: {
      announcementAndOffers: newsLetterAnnouncementAndOffers,
      featuresAnnouncement: newsLetterFeaturesAnnouncement,
    },
  };

  return updates;
};

// @desc Delete user account
// @type MUTATION
// @access Public
module.exports.deleteAccount = asyncHandler(async (_, args, context) => {
  const user = await User.findByIdAndRemove(context.user.id);

  return new SuccessResponse(200, true, user);
});

// @desc Send verification code to an email when changing an email
// @type MUTATION
// @access Private
module.exports.sendCodeForChangingEmail = asyncHandler(
  async (_, args, context) => {
    // Make sure that old email and new email are not the same
    if (args.oldEmail === args.newEmail) {
      return new ErrorResponse(
        400,
        'Old email and new email must not be the same.'
      );
    }

    // Check that old email has not been registered before
    const newEmailExist = await User.findOne({ email: args.newEmail });
    if (newEmailExist) {
      return new ErrorResponse(
        400,
        'The email you are trying to change to already exists.'
      );
    }

    const user = await User.findById(context.user.id);

    // Make sure that the email exists
    if (user.registeredWith !== 'Email') {
      throw new ErrorResponse(
        404,
        'Email is linked with a single sign on and cannot be changed.'
      );
    }

    // Make sure that the email matches
    if (user.email !== args.oldEmail) {
      throw new ErrorResponse(404, 'Old email does not match.');
    }

    const userChangeEmail = await UserChangeEmail.create({
      newEmail: args.newEmail,
      oldEmail: args.oldEmail,
    });

    const { token, code } = userChangeEmail.handleEmailReplacement();
    await userChangeEmail.save();

    // Send verification code to user
    try {
      // get template
      let template = await templateParser('emailChanged.html', {
        host: templateParser.host(),
        fullname: user.name,
        previousEmail: args.oldEmail,
      });

      // check if template processing was successful
      if (template) {
        const params = createEmailParam(
          null,
          [args.newEmail],
          `Your verification code`,
          template
        );

        await sendEmail(params);
      } else
        return new ErrorResponse(
          500,
          errors.build('E1000', 'Failed. Please try again.')
        );
    } catch (error) {
      return new ErrorResponse(500, 'Failed. Please try again.');
    }

    return new SuccessResponse(200, true, null, token);
  }
);

// @desc Verify code send to an email that is about to replace a registered email
// @type MUTATION
// @access Private
module.exports.verifyCodeForChangingEmail = asyncHandler(async (_, args) => {
  const changeEmailToken = crypto
    .createHash('sha256')
    .update(args.token)
    .digest('hex');

  // Check that the session still exists
  const userChangeEmail = await UserChangeEmail.findOne({
    changeEmailToken,
  });

  if (!userChangeEmail) {
    return new ErrorResponse(400, 'Session expired.');
  }

  if (userChangeEmail.changeEmailCode !== args.code) {
    return new ErrorResponse(400, 'Incorrect code');
  }

  // Check that old email has not been registered before
  const newEmailExist = await User.findOne({ email: userChangeEmail.newEmail });
  if (newEmailExist) {
    return new ErrorResponse(
      400,
      'The email you are trying to change to already exists.'
    );
  }

  // Change the email
  const user = await User.findOne({ email: userChangeEmail.oldEmail });
  user.email = userChangeEmail.newEmail;
  await user.save();

  return new SuccessResponse(200, true, user);
});

// @desc Change a user's password
// @type MUTATION
// @access Private
module.exports.changePassword = asyncHandler(async (_, args, context) => {
  // Check db for user
  const user = await User.findById(context.user.id).select('+password');

  // Check if password matches
  const isPasswordMatch = await user.comfirmPassword(args.oldPassword);

  if (!isPasswordMatch) {
    return new ErrorResponse(400, 'Old password is incorrect.');
  }

  // Change the password
  const salt = await bcrypt.genSalt(10);
  const password = await bcrypt.hash(args.newPassword, salt);
  user.password = password;
  await user.save();

  const token = user.getSignedJwtToken();
  return new SuccessResponse(200, true);
});

// @desc Edit settings related to events
// @type MUTATION
// @access Private
module.exports.editEventSetting = asyncHandler(async (_, args, context) => {
  if (args.defaultReminderConfiguration) {
    if (args.defaultReminderConfiguration.number <= 0) {
      return new ErrorResponse(
        400,
        "Reminder Interval's unit number must not be 0"
      );
    }
  }

  await User.findByIdAndUpdate(context.user.id, { eventSettings: args });

  return new SuccessResponse(200, true);
});

// @desc Get user profiles
// @type QUERY
// @access Private

module.exports.editUserProfile = asyncHandler(async (_, args, context) => {
  const userId = context.user.id;
  const userBeforeEdit = await User.findById(userId).select('photo');

  const user = await User.findByIdAndUpdate(userId, args, {
    new: true,
  });

  user.id = user._id;

  const oldPhoto = userBeforeEdit.photo;
  if (oldPhoto !== args.photo) {
    await deleteOldFile(oldPhoto);
  }
  return new SuccessResponse(200, true, user);
});

// @desc Get notifications
// @type QUERY
// @access Private

module.exports.editNotification = asyncHandler(async (_, args, context) => {
  const updates = generateEditNotificationUpdates(args.input);
  const user = await User.findByIdAndUpdate(context.user.id, updates, {
    new: true,
  });

  user.id = user._id;
  return new SuccessResponse(200, true, user);
});

module.exports.savePushNotificationToken = asyncHandler(
  async (_, args, context) => {
    const userId = context.user.id;
    const updates = { isPushNotifTokenSaved: true };

    if (args.platform === 'IOS') {
      updates.iosPushNotifToken = args.token;
    }

    if (args.platform === 'ANDROID') {
      updates.androidPushNotifToken = args.token;
    }

    // Update the token on the user's record
    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
    });

    // Update the token on any logged-in session belonging to the user
    // If there is no login session, create a new one
    await LoginSession.findOneAndUpdate(
      { user: userId, platform: args.platform },
      { deviceToken: args.token },
      { upsert: true }
    );

    user.id = user._id;
    return new SuccessResponse(200, true, user);
  }
);

module.exports.updateIosAppVersion = asyncHandler(async (_, args, context) => {
  await User.findByIdAndUpdate(context.user.id, {
    iosAppVersion: args.version,
  });

  return new SuccessResponse(200, true);
});
