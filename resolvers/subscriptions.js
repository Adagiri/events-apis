const { combineResolvers } = require('graphql-resolvers');
const { activateFreeTrial } = require('../controllers/subscriptions');
const { protect, authorize } = require('../middleware/auth');

module.exports = {
  Mutation: {
    subscriptions_activateFreeTrial: combineResolvers(
      protect,
      activateFreeTrial
    ),
  },
};
