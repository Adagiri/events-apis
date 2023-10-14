const fs = require('fs').promises;
const mongoose = require('mongoose');
const { readFileSync } = require('fs');
const jwt = require('jsonwebtoken');
const { retrieveFile } = require('./AwsService');
const { default: axios } = require('axios');
const { X509Certificate } = require('crypto');
const JWKtoPem = require('jwk-to-pem');
const path = require('path');
const AppStoreSubscriptionTransaction = require('../models/AppStoreSubscriptionTransaction');
const User = require('../models/User');
const { sendSingleEmail } = require('../utils/misc');

const appleRootPemFile = path.join(__dirname, '../config/apple_root.pem');

const KID = process.env.APPSTORE_IN_APP_PURCHASE_KEY_ID;
const ISS = process.env.APPSTORE_IN_APP_PURCHASE_ISSUER_ID;
const BID = process.env.APPSTORE_IN_APP_PURCHASE_BUNDLE_ID;
const APPLE_REQUEST_TEST_NOTIFICATION_URL =
  process.env.APPLE_REQUEST_TEST_NOTIFICATION_URL;

const handleVerifiedAppStoreNotification = async ({
  notificationData,
  payload,
  res,
}) => {
  const { transactionInfo, transactionRenewalInfo } = notificationData;
  const payloadObj = JSON.parse(payload);
  const type = payloadObj.notificationType;
  const subtype = payloadObj.subtype;
  const notificationUUID = payloadObj.notificationUUID;
  const appAccountToken = transactionInfo.appAccountToken;
  const transactionId = transactionInfo.transactionId;

  const originalTransactionId = transactionInfo.originalTransactionId;
  const expiryDate = new Date(transactionInfo.expiresDate);
  const startDate = new Date(transactionInfo.purchaseDate);
  const productType =
    transactionInfo.productId === 'Monthly123' ? 'Monthly' : 'Yearly';
  const isRenewable =
    transactionRenewalInfo.autoRenewStatus === 0 ? false : true;

  try {
    // Check that transaction has not been handled in the past
    const existingNotification = await AppStoreSubscriptionTransaction.findOne({
      notificationUUID,
    });

    // Notification has already been handled. This new request is a duplicate
    if (existingNotification) {
      return res.status(200);
    }

    const user = await User.findOne({
      'subscriptionInfo.appStoreUserUUID': appAccountToken,
    }).select('subscriptionInfo email');

    // User could not be found
    if (!user) {
      return res.status(200);
    }
    const userId = user._id;

    if (type === 'SUBSCRIBED' || type === 'DID_RENEW') {
      const newTransactionArgs = {
        user: userId,
        transactionId,
        originalTransactionId,
        notificationUUID,
        type,
      };

      const subscriptionUpdate = {
        'subscriptionInfo.isPremiumActive': true,
        'subscriptionInfo.platform': 'AppStore',
        'subscriptionInfo.expiryDate': expiryDate,
        'subscriptionInfo.startDate': startDate,
        'subscriptionInfo.appStore.originalTransactionId':
          originalTransactionId,
        'subscriptionInfo.appStore.transactionId': transactionId,
        'subscriptionInfo.appStore.productType': productType,
        'subscriptionInfo.appStore.startDate': startDate,
        'subscriptionInfo.appStore.expiryDate': expiryDate,
        'subscriptionInfo.appStore.isRenewable': isRenewable,
      };

      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        // Update user's subscription details
        await User.findByIdAndUpdate(
          userId,
          {
            $set: subscriptionUpdate,
          },
          { session }
        );

        // Record the transaction
        await AppStoreSubscriptionTransaction.create([newTransactionArgs], {
          session,
        });
      });
      session.endSession();

      return res.status(200);
    }

    if (type === 'DID_CHANGE_RENEWAL_STATUS') {
      const subscriptionUpdate = {
        'subscriptionInfo.appStore.isRenewable': isRenewable,
      };

      await User.findByIdAndUpdate(userId, {
        $set: subscriptionUpdate,
      });

      return res.status(200);
    }

    if (type === 'DID_FAIL_TO_RENEW' && subtype === undefined) {
      const subscriptionUpdate = {
        'subscriptionInfo.isPremiumActive': false,
      };
      await User.findByIdAndUpdate(userId, {
        $set: subscriptionUpdate,
      });

      // Send billing failure alert through email
      const emailParams = {
        email: user.email,
        subject: 'Subscription Deactivated',
        message:
          'Your subscription failed to renew. This could be an issue with your billing method. Please check your billing method to confirm.',
      };
      await sendSingleEmail(emailParams);
      return res.status(200);
    }

    if (type === 'EXPIRED') {
      const subscriptionUpdate = {
        'subscriptionInfo.isPremiumActive': false,
      };

      const newTransactionArgs = {
        user: userId,
        transactionId,
        originalTransactionId,
        notificationUUID,
        type,
      };

      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await User.findByIdAndUpdate(
          userId,
          {
            $set: subscriptionUpdate,
          },
          { session }
        );

        await AppStoreSubscriptionTransaction.create([newTransactionArgs], {
          session,
        });
      });
      session.endSession();

      return res.status(200);
    }

    if (type === 'GRACE_PERIOD_EXPIRED') {
      const subscriptionUpdate = {
        'subscriptionInfo.isPremiumActive': false,
      };
      await User.findByIdAndUpdate(userId, {
        $set: subscriptionUpdate,
      });

      const emailParams = {
        email: user.email,
        subject: 'Subscription Deactivated',
        message:
          'Your subscription failed to renew. This could be an issue with your billing method. Please check your billing method to confirm.',
      };
      await sendSingleEmail(emailParams);
      // Send email of billing failure
      return res.status(200);
    }

    if (type === 'REFUND') {
      const mostRecentOriginalTransactionId =
        user.subscriptionInfo?.appStore?.originalTransactionId;

      const mostRecentProduct = user.subscriptionInfo?.appStore?.productType;

      const newTransactionArgs = {
        user: userId,
        transactionId,
        originalTransactionId,
        notificationUUID,
        type,
      };

      if (
        mostRecentOriginalTransactionId === originalTransactionId &&
        mostRecentProduct === productType
      ) {
        const subscriptionUpdate = {
          'subscriptionInfo.isPremiumActive': false,
        };

        await session.withTransaction(async () => {
          // Update user's subscription details
          await User.findByIdAndUpdate(
            userId,
            {
              $set: subscriptionUpdate,
            },
            { session }
          );

          // Record the transaction
          await AppStoreSubscriptionTransaction.create([newTransactionArgs], {
            session,
          });
        });
        session.endSession();
        return res.status(200);
      } else {
        // Record the transaction
        await AppStoreSubscriptionTransaction.create([newTransactionArgs], {
          session,
        });
        return res.status(200);
      }
    }
  } catch (error) {
    console.log(error, 'error when handling verified notification');
    return res.status(500);
  }
};

const verifyAndGetAppStoreTransactions = (header, payload) => {
  const alg = header['alg'];
  const x5c = header['x5c'];

  try {
    const x5cCertificates = x5c.map(
      (header) => new X509Certificate(Buffer.from(header, 'base64'))
    );
    const appleRootCertificate = new X509Certificate(
      readFileSync(appleRootPemFile)
    );

    // console.log(appleRootCertificate, 'apple root certificate');

    const checkIssued = appleRootCertificate.checkIssued(
      x5cCertificates[x5cCertificates.length - 1]
    );
    if (!checkIssued) {
      return { verificationPassed: false };
    }

    x5cCertificates.push(appleRootCertificate);

    const verifierStatuses = x5cCertificates.map((x590, index) => {
      if (index >= x5cCertificates.length - 1) return true;
      return x590.verify(x5cCertificates[index + 1].publicKey);
    });

    if (verifierStatuses.includes(false)) {
      return { verificationPassed: false };
    }

    const publicKeyToPEM = JWKtoPem(
      x5cCertificates[0].publicKey.export({
        format: 'jwk',
      })
    );

    // console.log(publicKeyToPEM, 'public key');

    const transactionInfo = jwt.verify(
      payload.data.signedTransactionInfo,
      publicKeyToPEM,
      {
        algorithms: alg,
      }
    );

    const transactionRenewalInfo = jwt.verify(
      payload.data.signedRenewalInfo,
      publicKeyToPEM,
      {
        algorithms: alg,
      }
    );

    return {
      verificationPassed: true,
      transactionInfo,
      transactionRenewalInfo,
    };
  } catch (error) {
    console.log(error, 'catched error');

    return { verificationPassed: false };
  }
};

const decodeAppStoreNotificationPayload = async (signedPayload) => {
  // const decodedPayload = jwt.decode(signedPayload);
  const decodedPayload = Buffer.from(signedPayload, 'base64').toString();
  return decodedPayload;
};

const getSignedJwtForAppStoreConnect = async () => {
  const header = {
    alg: 'ES256',
    kid: KID,
    typ: 'JWT',
  };

  // INITIATION TIME must be in seconds
  const initiationTime = Date.now() / 1000;

  // EXPIRY TIME is 30 mins after INITIATION TIME
  const expiryTime = initiationTime + 30 * 60; // 30 min * 60 seconds

  const payload = {
    iss: ISS,
    iat: initiationTime,
    exp: expiryTime,
    aud: 'appstoreconnect-v1',
    bid: BID,
  };

  // Get private key stored in s3 bucket
  const privateKey = await getAppStorePrivateKey();

  const token = jwt.sign(payload, privateKey, { header: header });
  console.log(token, 'token');

  return token;
};

const getAppStorePrivateKey = async () => {
  let key = null;
  try {
    const fileString = await fs.readFile(
      'config/ios_in-app-purchase_key.p8',
      'utf8'
    );
    console.log(fileString, 'apple private key file found');
    key = fileString;
  } catch (error) {
    const fileResponse = await retrieveFile(
      'ios_in-app-purchase_key.p8',
      'events-app-secrets'
    );
    const buffer = fileResponse.Body;
    const fileString = buffer.toString('utf8');
    console.log(fileString, 'apple private key file retrieved');

    key = fileString;
    await saveAppStorePrivateKey(fileString);
  }
  console.log(key);
  return key;
};

const saveAppStorePrivateKey = async (fileString) => {
  try {
    await fs.writeFile('config/ios_in-app-purchase_key.p8', fileString);
    console.log(fileString, 'fileResponse', 'file written');
  } catch (error) {
    console.log(error, 'error occured whilst saving key file');
  }
};

const sendAppStoreNotification = async () => {
  const token = await getSignedJwtForAppStoreConnect();

  try {
    const resp = await axios.post(APPLE_REQUEST_TEST_NOTIFICATION_URL, null, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.log(
      error,
      'error occured whilst sending notification request api to apple'
    );
  }
};

module.exports = {
  getSignedJwtForAppStoreConnect,
  handleVerifiedAppStoreNotification,
  sendAppStoreNotification,
  decodeAppStoreNotificationPayload,
  verifyAndGetAppStoreTransactions,
};
