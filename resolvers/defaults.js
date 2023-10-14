const {
  DateScalar,
  TimeScalar,
  DateTimeScalar,
} = require('graphql-date-scalars');
const {
  getFileUploadUrl,

} = require('../controllers/defaults');
module.exports = {
  DateTime: DateTimeScalar,
  Date: DateScalar,
  Time: TimeScalar,

  Query: {
    file_getUploadUrl: getFileUploadUrl,

  },
};
