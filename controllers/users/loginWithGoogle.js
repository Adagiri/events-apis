const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { sendEmail, createEmailParam } = require('../../utils/notifications');
const { ErrorResponse, SuccessResponse } = require('../../utils/responses');
const { handleLoginSession } = require('./utils');
const { errors } = require('../../utils/errorCodeMap');
const templateParser = require('../../utils/templateParser');

module.exports = asyncHandler(async (_, args, context) => {
  const email = args.email;
  const deviceType = args.deviceType;

  const query = [
    {
      ssoGoogleId: args.ssoGoogleId,
      isSignupCompleted: true,
    },
  ];

  if (email) {
    query.push({ email: email, isSignupCompleted: true });
  }

  const existingUser = await User.findOne({
    $or: query,
  });

  if (existingUser) {
    await handleLoginSession(existingUser, deviceType);
    const token = existingUser.getSignedJwtToken();
    return new SuccessResponse(200, true, existingUser, token);
  }

  if (email) {
    args.isEmailVerified = true;
  }

  args.isSignupCompleted = true;
  args.receiveNewsletter = true;
  args.registeredWith = 'Google';
  args.subscriptionInfo = {
    appStoreUserUUID: uuidv4(),
  };

  const newUser = await User.create(args);
  const token = newUser.getSignedJwtToken();

  if (email) {
    try {
      // get template
      let template = await templateParser('login.html', {
        host: templateParser.host(),
        fullname: args.name ? args.name : '',
      })

      // check if template processing was successful
      if (template) {
        const params = createEmailParam(
          null,
          [email],
          `Welcome ${args.name ? args.name : ''}`,
          template
        );

        await sendEmail(params);
      } else return new ErrorResponse(500, errors.build('E1000', 'Failed. Please try again.'));
    } catch (error) {
      return new ErrorResponse(500, 'Failed. Please try again.');
    }
  }

  await handleLoginSession(newUser, deviceType);
  return new SuccessResponse(201, true, newUser, token);
});
