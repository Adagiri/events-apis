const crypto = require('crypto');
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

  user.verifyEmailExpire = new Date();
  await user.save();

  try {
    // get template
    let template = await templateParser('emailVerification.html', {
      host: templateParser.host(),
      verificationCode: user.verifyEmailCode
    })

    // check if template processing was successful
    if (template) {
      const params = createEmailParam(
        null,
        [user.email],
        `Your verification code`,
        template
      );

      await sendEmail(params);
    } else return new ErrorResponse(500, errors.build('E1000', 'Failed. Please try again.'));
  } catch (error) {
    console.log(error);
    return new ErrorResponse(500, 'Failed. Please try again.');
  }

  return new SuccessResponse(200, true, null, user.token);
});
