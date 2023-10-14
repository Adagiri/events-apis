const mongoose = require('mongoose');
const crypto = require('crypto');
const { randomNumbers } = require('../utils/misc');

const LoginSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.ObjectId,
    required: true,
    ref: 'User',
  },

  platform: {
    type: String,
    enum: ['ANDROID', 'IOS'],
  },

  deviceToken: {
    type: String,
    default: null,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('LoginSession', LoginSessionSchema);
