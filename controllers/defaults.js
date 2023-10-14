const asyncHandler = require('../middleware/async');
const { getS3SignedUrl } = require('../utils/fileUploads');
const { randomNumbers } = require('../utils/misc');

// @desc Get file upload url
// @type QUERY
// @access Private
module.exports.getFileUploadUrl = asyncHandler(async (_, args, context) => {
  const { purpose, contentType } = args;

  // Handle urls for profile photo uploads
  if (purpose === 'Profile_Photo') {
    if (['image/jpeg', 'image/png'].indexOf(contentType) === -1) {
      return new ErrorResponse(400, 'Please upload a jpeg or png file');
    }
  }

  // Handle urls for event backdrop
  if (purpose === 'Event_Backdrop') {
    if (['image/jpeg', 'image/png'].indexOf(contentType) === -1) {
      return new ErrorResponse(400, 'Please upload a jpeg or png file');
    }
  }

  let key = `${randomNumbers(30)}.${contentType.slice(6)}`;
  key = process.env.TEST_ENV === 'false' ? key : `test/${key}`;
  const uploadUrl = getS3SignedUrl(key, contentType);

  return { key: `/${key}`, uploadUrl };
});
