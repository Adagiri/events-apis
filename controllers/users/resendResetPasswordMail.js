const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { sendEmail, createEmailParam } = require('../../utils/notifications');
const { ErrorResponse, SuccessResponse } = require('../../utils/responses');
const { errors } = require('../../utils/errorCodeMap');
const templateParser = require('../../utils/templateParser');

module.exports = asyncHandler(async (_, args, context) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(args.token)
    .digest('hex');

  const existingUser = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!existingUser) {
    return new ErrorResponse(400, 'Ssession expired.');
  }

  existingUser.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  await existingUser.save();

  try {
    // get template
    let template = await templateParser('resetPassword.html', {
      host: templateParser.host(),
      name: existingUser.name ? ' ' + existingUser.name : '',
      code: code
    })

    // check if template processing was successful
    if (template) {
      const params = createEmailParam(
        null,
        [existingUser.email],
        `Your Reset Password Code`,
        template
      );

      await sendEmail(params);
    } else return new ErrorResponse(500, errors.build('E1000', 'Failed. Please try again.'));
  } catch (error) {
    return new ErrorResponse(500, 'Failed. Please try again.');
  }
  return new SuccessResponse(200, true, null, args.token);
});
