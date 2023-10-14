const {
  getLoggedInUser,
  getUserById,
  getSubscriptionInfo,
} = require('./queries');
const editUserProfile = require('./editUserProfile');
const sendVerificationCode = require('./sendVerificationCode');
const resendVerificationCode = require('./resendVerificationCode');
const verifyEmail = require('./verifyEmail');
const loginWithGoogle = require('./loginWithGoogle');
const loginWithApple = require('./loginWithApple');
const logout = require('./logout');
const login = require('./login');
const register = require('./register');
const registerWithGoogle = require('./registerWithGoogle');
const registerWithApple = require('./registerWithApple');
const sendResetPasswordMail = require('./sendResetPasswordMail');
const resendResetPasswordMail = require('./resendResetPasswordMail');
const verifyResetPasswordCode = require('./verifyResetPasswordCode');
const resetPassword = require('./resetPassword');
const deleteAccount = require('./deleteAccount');
const deleteAccountByEmail = require('./deleteAccountByEmail');

// QUERIES
module.exports.getLoggedInUser = getLoggedInUser;

module.exports.getUserById = getUserById;

module.exports.getSubscriptionInfo = getSubscriptionInfo;

// MUTATIONS
module.exports.editUserProfile = editUserProfile;

module.exports.sendVerificationCode = sendVerificationCode;

module.exports.resendVerificationCode = resendVerificationCode;

module.exports.verifyEmail = verifyEmail;

module.exports.loginWithGoogle = loginWithGoogle;

module.exports.loginWithApple = loginWithApple;

module.exports.login = login;

module.exports.logout = logout;

module.exports.register = register;

module.exports.registerWithGoogle = registerWithGoogle;

module.exports.registerWithApple = registerWithApple;

module.exports.sendResetPasswordMail = sendResetPasswordMail;

module.exports.resendResetPasswordMail = resendResetPasswordMail;

module.exports.verifyResetPasswordCode = verifyResetPasswordCode;

module.exports.resetPassword = resetPassword;

module.exports.deleteAccount = deleteAccount;

module.exports.deleteAccountByEmail = deleteAccountByEmail;
