const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { sendEmail, createEmailParam } = require('../../utils/notifications');
const { ErrorResponse, SuccessResponse } = require('../../utils/responses');
const { errors } = require('../../utils/errorCodeMap');
const templateParser = require('../../utils/templateParser');

module.exports = asyncHandler(async (_, args, context) => {
  const userExist = await User.findOne({
    email: args.email,
    isSignupCompleted: true,
  });

  if (userExist) {
    throw new ErrorResponse(404, 'Email taken');
  }

  const user = await User.create(args);

  const { token, code } = user.handleEmailVerification();
  await user.save();

  try {
    // get template
    let template = await templateParser('emailVerification.html', {
      host: templateParser.host(),
      verificationCode: code
    })

    // check if template processing was successful
    if (template) {
      const params = createEmailParam(
        null,
        [args.email],
        `Your verification code`,
        template
      );

      await sendEmail(params);
    } else return new ErrorResponse(500, errors.build('E1000', 'Failed. Please try again.'));
  } catch (error) {
    return new ErrorResponse(500, 'Failed. Please try again.');
  }

  return new SuccessResponse(200, true, null, token);
});
