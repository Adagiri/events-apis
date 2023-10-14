const { skip } = require('graphql-resolvers');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ErrorResponse } = require('../utils/responses');
const { parse } = require('graphql');

const getOperationName = (graphqlRequestBody) => {
  const queryDocument = graphqlRequestBody.query;
  const ast = parse(queryDocument);

  let operationName = null;

  // Check if the AST has an operation name
  if (ast.definitions && ast.definitions.length > 0) {
    for (const definition of ast.definitions) {
      // console.log(definition.variableDefinitions);
      if (definition.kind === 'OperationDefinition' && definition.name) {
        operationName = definition.name.value;
        break; // Stop after finding the first operation name
      }
    }
  }

  return operationName;
};

async function getUserInfo(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);

    if (payload) {
      return payload;
    }
    return null;
  } catch (error) {}
}

async function protect(_, __, context) {
  const iosCurrentVersion = '1.04';
  const user = await User.findById(context.user?.id).select(
    'name email ssoAppleId ssoGoogleId eventSettings iosAppVersion'
  );

  if (!user) {
    return new ErrorResponse(401, 'Please log in to continue');
  }

  const operationName = getOperationName(context.req.body);

  // if (operationName !== 'UpdateIosVersion') {
  //   if (user.iosAppVersion !== iosCurrentVersion) {
  //     return new ErrorResponse(400, 'Please update your application');
  //   }
  // }

  context.user = user;
  context.user.id = user._id;

  return skip;
}

function authorize(...roles) {
  return (_, __, context) => {
    if (!roles.includes(context.user.role)) {
      return new ErrorResponse(
        403,
        'You are not authorized to perform this action'
      );
    }

    return skip;
  };
}

module.exports = {
  protect,
  authorize,
  getUserInfo,
};
