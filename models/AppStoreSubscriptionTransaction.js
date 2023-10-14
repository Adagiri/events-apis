const mongoose = require('mongoose');

const AppStoreSubscriptionTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.ObjectId,
    required: true,
    ref: 'User',
  },

  type: {
    type: String,
    enum: ['SUBSCRIBED', 'DID_RENEW', 'EXPIRED'],
  },

  transactionId: {
    type: String,
    required: true,
  },

  notificationUUID: {
    type: String,
    required: true,
  },

  originalTransactionId: {
    type: String,
    required: true,
  },

});

module.exports = mongoose.model(
  'AppStoreSubscriptionTransaction',
  AppStoreSubscriptionTransactionSchema
);
