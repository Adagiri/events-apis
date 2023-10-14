const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { sendEmail, createEmailParam } = require('../../utils/notifications');
const { ErrorResponse, SuccessResponse } = require('../../utils/responses');
const { errors } = require('../../utils/errorCodeMap');
const templateParser = require('../../utils/templateParser');

module.exports = asyncHandler(async (_, args, context) => {
  const verifyEmailToken = crypto
    .createHash('sha256')
    .update(args.token)
    .digest('hex');

  const user = await User.findOne({
    verifyEmailToken,
  });

  if (!user) {
    return new ErrorResponse(400, 'Registration session expired.');
  }

  const salt = await bcrypt.genSalt(10);
  const password = await bcrypt.hash(args.password, salt);

  user.name = args.name; // updates
  user.password = password; // updates
  user.isSignupCompleted = true; // updates
  user.registeredWith = 'Email'; // updates
  user.eventSettings = { timeZone: args.timeZone }; // updates
  user.subscriptionInfo.appStoreUserUUID = uuidv4(); // updates
  user.verifyEmailToken = undefined; // updates
  user.verifyEmailExpire = undefined; // updates
  user.verifyEmailCode = undefined; // updates
  await user.save();

  const token = user.getSignedJwtToken();

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
        [user.email],
        `Welcome ${args.name}`,
        template
      );

      await sendEmail(params);
    } else return new ErrorResponse(500, errors.build('E1000', 'Failed. Please try again.'));
  } catch (error) {
    return new ErrorResponse(500, 'Failed. Please try again.');
  }

  return new SuccessResponse(201, true, user, token);
});
