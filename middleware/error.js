const { ErrorResponse } = require('../utils/responses');

const errorHandler = (err) => {
  err.message;
  let error = { ...err };

  //
  error.message = err.message;

  // Mongoose Bad ObjectId
  if (err.name === 'CastError') {
    let message = `Resource not found with id of ${err.value}`;

    if (err.message.startsWith('Cast to ObjectId failed')) {
    } else {
      message = `Incorrect argument passed: ${err.stringValue || err.value}`;
    }

    error = new ErrorResponse(404, message);
  }

  // Mongoose duplicate field value
  if (err.code === 11000) {
    const message = `Duplicate field value entered`;

    error = new ErrorResponse(400, message);
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => {
      return val.message;
    });

    error = new ErrorResponse(400, message);
  }

  console.log(error);

  const errorCode = error.extensions?.exception?.code;
  const status = [400, 401, 403].indexOf(errorCode) !== -1 ? errorCode : 500;

  if (process.env.TEST_ENV === 'false') {
    return {
      status: status,
      message: status === 500 ? 'Server Error' : error.message,
    };
  } else {
    return {
      status: errorCode || 500,
      message: error.message || 'Server Error',
    };
  }
};

module.exports = errorHandler;
