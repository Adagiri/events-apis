const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

const getS3SignedUrl = (key, contentType) => {
 

  var params = {
    Bucket: process.env.AWS_S3_FILEUPLOAD_BUCKET,
    Key: key,
    ContentType: contentType,
  };

  return s3.getSignedUrl('putObject', params);
};

module.exports = { getS3SignedUrl };
