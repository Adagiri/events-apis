const mongoose = require('mongoose');

const Invitation = new mongoose.Schema({
  _id: false,
  email: {
    type: String,
    required: true,
  },

  invitor: {
    type: mongoose.ObjectId,
    ref: 'User',
    required: true,
  },
});

const Todo = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },

  note: {
    type: String,
  },

  isCompleted: {
    type: Boolean,
    default: false,
  },
});

const Routine = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  phone: {
    type: String,
  },

  country: {
    type: String,
  },

  subject: {
    type: String,
    trim: true,
  },

  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },

  note: {
    type: String,
    required: true,
  },

  routineType: {
    type: String,
    enum: ['email', 'sms'],
    required: true,
  },

  status: {
    type: String,
    enum: ['Sent', 'To be sent', 'Delivered'],
    default: 'To be sent',
  },
});

const EventSchema = new mongoose.Schema({
  platformSource: {
    type: String,
    default: 'Custom',
    required: true,
    enum: ['Custom', 'Apple', 'Google'],
  },

  platformSourceId: String,

  title: {
    type: String,
    required: true,
  },

  description: {
    type: String,
  },

  location: {
    longitude: Number,
    latitude: Number,
    address: String,
    country: String,
    state: String,
    city: String,
  },

  isAllDay: {
    type: Boolean,
    default: false,
  },

  date: {
    type: Date,
    required: true,
  },

  endDate: {
    type: Date,
    required: true,
  },

  customReminderConfiguration: {
    number: {
      type: Number,
    },

    unit: {
      type: String,
      enum: ['week', 'day', 'hour', 'minute'],
    },
  },

  customReminderTime: {
    type: Date,
  },

  defaultReminderConfiguration: {
    number: {
      type: Number,
    },

    unit: {
      type: String,
      enum: ['week', 'day', 'hour', 'minute'],
    },
  },

  defaultReminderTime: {
    type: Date,
  },

  defaultReminderNotificationsSent: {
    type: Boolean,
    default: false,
  },

  customReminderNotificationsSent: {
    type: Boolean,
    default: false,
  },

  todoCount: {
    type: Number,
    default: 0,
  },

  todos: {
    type: [Todo],
  },

  routineCount: {
    type: Number,
    default: 0,
  },

  routines: {
    type: [Routine],
  },

  bgCover: {
    type: String,
    required: true,
  },

  inviteLinkId: {
    type: String,
    required: true,
  },

  invitations: [Invitation],
  isInviteLinkActive: {
    type: Boolean,
    default: true,
  },

  invitedEmails: {
    type: [String],
    // required: true,
  },

  inviteeRoles: [
    {
      _id: false,
      id: {
        type: mongoose.ObjectId,
        required: true,
      },

      role: {
        type: String,
        enum: ['Viewer', 'Editor', 'Admin'],
        default: 'Viewer',
        required: true,
      },
    },
  ],
  invitees: [{ type: mongoose.ObjectId, ref: 'User', required: true }],

  repeatConfiguration: {
    sequence: {
      type: Number,
      default: 1,
    },

    unit: {
      type: String,
      enum: ['week', 'day', 'month', 'year'],
      default: 'day',
    },

    endTime: { type: Date },

    isEnabled: { type: Boolean, default: false },
  },

  nextRepetitionDate: { type: Date },
  nextRepetitionDay: { type: String },

  myRole: String,
  owner: {
    type: mongoose.ObjectId,
    required: true,
    ref: 'User',
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

EventSchema.pre('remove', async function (next) {
  next();
});

module.exports = mongoose.model('Event', EventSchema);
