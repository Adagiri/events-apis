const mongoose = require('mongoose');

mongoose.connection.once('open', () => {
  console.log('MongoDB connected'.cyan.bold);
});

mongoose.connection.on('error', (err) => {
  console.error('err'.red.underline, err);
});

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URL);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = connectDB;

module.exports = {
  connectDB,
  disconnectDB,
};
