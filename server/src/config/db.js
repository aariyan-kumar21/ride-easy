const mongoose = require('mongoose');
const env = require('./env');

function maskMongoUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

async function connectDB() {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 5000
  });

  console.log(`MongoDB connected: ${maskMongoUri(env.mongodbUri)}`);
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('MongoDB connection closed gracefully');
  }
}

module.exports = { connectDB, disconnectDB };

