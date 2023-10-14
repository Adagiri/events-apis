const mongoose = require('mongoose');
const crypto = require('crypto');
const { randomNumbers } = require('../utils/misc');

const UserChangeEmailSchema = new mongoose.Schema({
  oldEmail: {
    type: String,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },

  newEmail: {
    type: String,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },

  expires: { type: Date, expires: 600 },

  changeEmailCode: String,
  changeEmailToken: String,
});

UserChangeEmailSchema.methods.handleEmailReplacement = function () {
  const token = crypto.randomBytes(20).toString('hex');
  const code = randomNumbers(5);

  // Hash token and set to verifyEmailToken field
  this.changeEmailToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  this.changeEmailCode = code;

  return {
    token,
    code,
  };
};

module.exports = mongoose.model('UserChangeEmail', UserChangeEmailSchema);
