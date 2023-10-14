const AWS = require('aws-sdk');
const fs = require('fs');

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_KEY,
};

AWS.config.apiVersions = {
  s3: '2006-03-01',
};

const sns = new AWS.SNS({
  region: 'us-east-1',
  credentials,
});

const ses = new AWS.SES({
  region: 'us-east-1',
  credentials,
});

var s3 = new AWS.S3({
  credentials,
});

const uploadFile = (params) => {
  // var params = { Bucket: 'bucket', Key: 'key', Body: stream };

  return s3.upload(params);
};

const retrieveFile = async (key, bucket) => {
  var params = {
    Bucket: bucket,
    Key: key,
  };
  const file = await s3.getObject(params).promise();

  return file;
};

const deleteS3File = async (key, bucket) => {
  console.log(key, 'key')
  var params = {
    Bucket: bucket,
    Key: key,
  };

  const file = await s3.deleteObject(params).promise();
  console.log(file);
};

module.exports = {
  sns,
  ses,
  uploadFile,
  retrieveFile,
  deleteS3File,
};
