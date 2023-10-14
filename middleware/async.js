const asyncHandler = (fn) => (...args) =>
  Promise.resolve(fn(...args)).catch((error) => {
    throw new Error(error);
  });

module.exports = asyncHandler;
