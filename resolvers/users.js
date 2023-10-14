const { combineResolvers } = require('graphql-resolvers');
const {
  getLoggedInUser,
  getUserById,
  sendVerificationCode,
  resendVerificationCode,
  verifyEmail,
  register,
  registerWithApple,
  registerWithGoogle,
  login,
  logout,
  loginWithGoogle,
  loginWithApple,
  sendResetPasswordMail,
  resendResetPasswordMail,
  verifyResetPasswordCode,
  resetPassword,
  deleteAccount,
  editUserProfile,
  getSubscriptionInfo,
  deleteAccountByEmail,
} = require('../controllers/users');
const { protect, authorize } = require('../middleware/auth');

module.exports = {
  Query: {
    user: combineResolvers(protect, getLoggedInUser),
    user_getById: combineResolvers(protect, getUserById),
    user_getSubscriptionInfo: combineResolvers(protect, getSubscriptionInfo),
  },
  Mutation: {
    user_editProfile: combineResolvers(protect, editUserProfile),

    auth_logout: combineResolvers(protect, logout),
    auth_sendVerificationCode: sendVerificationCode,
    auth_resendVerificationCode: resendVerificationCode,
    auth_verifyEmail: verifyEmail,
    auth_register: register,
    auth_registerWithApple: registerWithApple,
    auth_registerWithGoogle: registerWithGoogle,
    auth_login: login,
    auth_loginWithApple: loginWithApple,
    auth_loginWithGoogle: loginWithGoogle,
    auth_sendResetPasswordMail: sendResetPasswordMail,
    auth_resendResetPasswordMail: resendResetPasswordMail,
    auth_verifyResetPasswordCode: verifyResetPasswordCode,
    auth_resetPassword: resetPassword,
    user_deleteAccount: combineResolvers(protect, deleteAccount),
    user_deleteAccountByEmail: deleteAccountByEmail,
  },
};
