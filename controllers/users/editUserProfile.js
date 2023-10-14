const asyncHandler = require('../../middleware/async');
const User = require('../../models/User');
const { SuccessResponse } = require('../../utils/responses');

const { deleteOldFile } = require('../../utils/misc');

module.exports = asyncHandler(async (_, args, context) => {
  const userId = context.user.id;
  const newPhoto = args.photo;
  const userBeforeEdit = await User.findById(userId).select('photo');
  const oldPhoto = userBeforeEdit.photo;

  const user = await User.findByIdAndUpdate(
    userId,
    { photo: newPhoto },
    {
      new: true,
    }
  );

  // If a new photo was uploaded, delete the old photo
  if (oldPhoto !== newPhoto) {
    await deleteOldFile(oldPhoto);
  }

  user.id = user._id;
  return new SuccessResponse(200, true, user);
});
