const { ApolloError } = require('apollo-server-core');

class ErrorResponse extends ApolloError {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.message = message;

    Object.defineProperty(this, 'name', { value: 'ErrorResponse' });
  }
}

class SuccessResponse {
  constructor(code, success, data, token) {
    this.code = code;
    this.success = success;
    if (data) this.data = data;
    if (token) this.token = token;
  }
}

module.exports = { ErrorResponse, SuccessResponse };
