const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { sendEmail, createEmailParam } = require('../../utils/notifications');
const { SuccessResponse, ErrorResponse } = require('../../utils/responses');
const { errors } = require('../../utils/errorCodeMap');
const templateParser = require('../../utils/templateParser');

module.exports = asyncHandler(async (_, args, context) => {
  const email = args.email;
  const query = [
    {
      ssoAppleId: args.ssoAppleId,
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
    const token = existingUser.getSignedJwtToken();
    return new SuccessResponse(200, true, existingUser, token);
  }

  if (email) {
    args.isEmailVerified = true;
  }

  args.isSignupCompleted = true;
  args.receiveNewsletter = true;
  args.registeredWith = 'Apple';
  args.eventSettings = { timeZone: args.timeZone };
  args.subscriptionInfo = {
    appStoreUserUUID: uuidv4(),
  };

  const newUser = await User.create(args);
  const token = newUser.getSignedJwtToken();

  if (email) {
    try {
      // get template
      let template = await templateParser('index.html', {
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
      return new ErrorResponse(
        500,
        'Failed. Please try again.'
      );
    }
  }

  return new SuccessResponse(201, true, newUser, token);
});
