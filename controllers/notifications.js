const endOfDay = require('date-fns/endOfDay');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const Notification = require('../models/Notification');
const User = require('../models/User');

const { SuccessResponse, ErrorResponse } = require('../utils/responses');

// @desc Get the total number of new notifications for the logged-in user
// @type QUERY
// @access Private
module.exports.getNewNotificationCount = asyncHandler(
  async (_, args, context) => {
    const user = await User.findById(context.user.id).select(
      'newNotifications'
    );

    return {
      count: user.newNotifications,
      hasNewNotification: user.newNotifications > 0,
    };
  }
);

// @desc Get the total number of unread notifications of the logged-in user
// @type QUERY
// @access Private
module.exports.getUnreadNotificationCount = asyncHandler(
  async (_, args, context) => {
    const user = await User.findById(context.user.id).select(
      'unreadNotifications'
    );

    return {
      count: user.unreadNotifications,
      hasUnreadNotification: user.unreadNotifications > 0,
    };
  }
);

// @desc Get notifications for the logged-in user
// @type QUERY
// @access Private
module.exports.getNotifications = asyncHandler(async (_, args, context) => {
  const limit = args.pagination?.limit
    ? Math.floor(parseInt(args.pagination.limit, 10))
    : 10;

  const cursor = args.pagination?.cursor;
  const userId = context.user.id;

  ////////////////////////////////////////////////////////////////////////////////////////
  const query = {
    owner: userId,
  };

  if (cursor) {
    query._id = { $lt: cursor };
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////
  let notifications = await Notification.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('initiator', 'name email photo')
    .populate('resourceId', 'bgCover');

  const totalDocs = await Notification.find({
    owner: userId,
  }).countDocuments();

  const hasNextPage = notifications.length > limit ? true : false;
  if (hasNextPage) {
    notifications = notifications.slice(0, limit);
  }
  const docsRetrieved = notifications.length;

  // Change new notifications count to 0
  await User.findByIdAndUpdate(userId, {
    newNotifications: 0,
  });

  return {
    data: notifications,
    pagination: {
      nextcursor: hasNextPage ? notifications[docsRetrieved - 1]._id : null,
      totalDocs,
      docsRetrieved,
      hasNextPage,
    },
  };
});

// @desc Mark a notification when it has been read, i.e clicked
// @type QUERY
// @access Private
module.exports.markNotificationAsClicked = asyncHandler(
  async (_, args, context) => {
    // Edit notification
    const notification = await Notification.findById(args.notificationId)
      .populate('initiator', 'name email photo')
      .populate('resourceId', 'bgCover');

    notification.clicked = args.clicked;
    await notification.save();

    const user = await User.findById(context.user.id);
    // Reduce unread notification count by 1
    if (user.unreadNotifications > 0) {
      user.unreadNotifications = user.unreadNotifications - 1;
    }

    // Change new notifications count to 0
    user.newNotifications = 0;
    await user.save();

    return new SuccessResponse(200, true, notification);
  }
);

// @desc  Mark a notification when an action has been carried out through it
// @type QUERY
// @access Private
module.exports.markNotificationAction = asyncHandler(
  async (_, args, context) => {
    const notification = await Notification.findById(args.notificationId)
      .populate('initiator', 'name email photo')
      .populate('resourceId', 'bgCover');

    notification.actionTaken = args.actionTaken;
    notification.clicked = true;
    await notification.save();

    const user = await User.findById(context.user.id);
    // Reduce unread notification count by 1
    if (user.unreadNotifications > 0) {
      user.unreadNotifications = user.unreadNotifications - 1;
    }

    // Change new notifications count to 0
    user.newNotifications = 0;
    await user.save();

    return new SuccessResponse(200, true, notification);
  }
);
