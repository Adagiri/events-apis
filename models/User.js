const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { randomNumbers } = require('../utils/misc');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },

  name: {
    type: String,
  },

  photo: {
    type: String,
  },

  password: {
    type: String,
    default: null,
    select: false,
  },

  isEmailVerified: {
    type: Boolean,
    default: false,
  },

  isSignupCompleted: {
    type: Boolean,
    default: false,
  },

  receiveNewsletter: {
    type: Boolean,
    default: false,
  },

  newNotifications: {
    type: Number,
    default: 0,
  },

  unreadNotifications: {
    type: Number,
    default: 0,
  },

  registeredWith: {
    type: String,
    enum: ['Google', 'Apple', 'Email'],
    default: 'Email',
  },

  subscriptionInfo: {
    appStoreUserUUID: { type: String },
    hasUsedFreeTrial: { type: Boolean, default: false },
    isFreeTrialActive: { type: Boolean, default: false },
    freeTrialExpiryDate: { type: Date, default: null },
    isPremiumActive: { type: Boolean, default: false },
    platform: { type: String, enum: ['PlayStore', 'AppStore'] },
    startDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    appStore: {
      originalTransactionId: { type: String },
      transactionId: { type: String },
      productType: { type: String, enum: ['Monthly', 'Yearly'] },
      startDate: { type: Date },
      expiryDate: { type: Date },
      isRenewable: { type: Boolean, default: false },
    },
  },

  // For single sign on
  ssoAppleId: String,
  ssoGoogleId: String,

  // For handling registration through email
  verifyEmailToken: String,
  verifyEmailExpire: { type: Date, expires: 600 },
  verifyEmailCode: String,

  // For Handling password reset
  resetPasswordToken: String,
  resetPasswordCode: String,
  resetPasswordExpire: Date,
  isResetPasswordCodeVerified: {
    type: Boolean,
  },

  // Event settings
  eventSettings: {
    defaultReminderConfiguration: {
      number: {
        type: Number,
        default: 15,
      },

      unit: {
        type: String,
        enum: ['week', 'day', 'hour', 'minute'],
        default: 'minute',
      },
    },

    timeZone: String,
  },

  // Push notification fields
  androidPushNotifToken: String,
  iosPushNotifToken: String,
  isPushNotifTokenSaved: {
    type: Boolean,
    default: false,
  },

  pushNotifSettings: {
    eventInvite: {
      type: Boolean,
      default: true,
    },

    eventDelete: {
      type: Boolean,
      default: true,
    },

    eventInvitationAcceptance: {
      type: Boolean,
      default: true,
    },

    eventInvitationRejection: {
      type: Boolean,
      default: true,
    },

    inviteeRemoved: {
      type: Boolean,
      default: true,
    },

    eventRoleAssigned: {
      type: Boolean,
      default: true,
    },

    todoCompleted: {
      type: Boolean,
      default: true,
    },

    todoUnmarked: {
      type: Boolean,
      default: true,
    },

    todoAdded: {
      type: Boolean,
      default: true,
    },

    todoEdited: {
      type: Boolean,
      default: true,
    },

    todoDeleted: {
      type: Boolean,
      default: true,
    },

    routineAdded: {
      type: Boolean,
      default: true,
    },

    routineEdited: {
      type: Boolean,
      default: true,
    },

    routineDeleted: {
      type: Boolean,
      default: true,
    },

    routineCompleted: {
      type: Boolean,
      default: true,
    },

    directMessaging: {
      type: Boolean,
      default: true,
    },
  },

  emailNotifSettings: {
    eventInvite: {
      type: Boolean,
      default: true,
    },

    eventDelete: {
      type: Boolean,
      default: true,
    },

    eventInvitationAcceptance: {
      type: Boolean,
      default: true,
    },

    eventInvitationRejection: {
      type: Boolean,
      default: true,
    },

    inviteeRemoved: {
      type: Boolean,
      default: true,
    },

    eventRoleAssigned: {
      type: Boolean,
      default: true,
    },

    todoCompleted: {
      type: Boolean,
      default: true,
    },

    todoUnmarked: {
      type: Boolean,
      default: true,
    },

    todoAdded: {
      type: Boolean,
      default: true,
    },

    todoDeleted: {
      type: Boolean,
      default: true,
    },

    todoEdited: {
      type: Boolean,
      default: true,
    },

    routineAdded: {
      type: Boolean,
      default: true,
    },

    routineEdited: {
      type: Boolean,
      default: true,
    },

    routineDeleted: {
      type: Boolean,
      default: true,
    },

    routineCompleted: {
      type: Boolean,
      default: true,
    },

    directMessaging: {
      type: Boolean,
      default: true,
    },
  },

  // newsletter fields
  newsletterSettings: {
    announcementAndOffers: {
      type: Boolean,
      default: false,
    },
    featuresAnnouncement: {
      type: Boolean,
      default: true,
    },
  },

  googleCalendarApiRefreshToken: {
    type: String,
    select: false,
  },

  isGoogleCalendarApiAuthorized: {
    type: Boolean,
    default: false,
  },

  appleCalendarAccessToken: { type: String, select: false },

  iosAppVersion: String,

  createdAt: {
    type: Date,
    default: Date.now,
  },
  id: String,
  role: String,
});

UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, email: this.email },
    process.env.JWT_SECRET_KEY,
    {
      expiresIn: process.env.JWT_EXPIRY_TIME,
    }
  );
};

UserSchema.methods.comfirmPassword = async function (password) {
  return bcrypt.compare(password, this.password || '');
};

UserSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(4).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

UserSchema.methods.handleEmailVerification = function () {
  const token = crypto.randomBytes(20).toString('hex');
  const code = randomNumbers(5);

  // Hash token and set to verifyEmailToken field
  this.verifyEmailToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Set expiration time for registration session
  this.verifyEmailExpire = Date.now() + 10 * 60 * 1000;
  this.verifyEmailCode = code;

  return {
    token,
    code,
  };
};

UserSchema.methods.handleResetPassword = function () {
  const token = crypto.randomBytes(20).toString('hex');
  const code = randomNumbers(5);

  // Hash token and set to verifyEmailToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Set expiration time for registration session
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  this.resetPasswordCode = code;
  this.isResetPasswordCodeVerified = false;

  return {
    token,
    code,
  };
};

// Cascade delete 'events, notifications' when a user is deleted
UserSchema.pre('remove', async function (next) {
  await this.model('Event').deleteMany({ owner: this._id });
  await this.model('Notification').deleteMany({ owner: this._id });
  await this.model('Notification').deleteMany({ initiator: this._id });
  next();
});

module.exports = mongoose.model('User', UserSchema);
