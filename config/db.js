const mongoose = require('mongoose');
const logger = require('../utils/logger');

mongoose.connection.on('error', error => logger.error('MongoDB connection error', { error }));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/web-daily';

  try {
    await mongoose.connect(mongoUri);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection failed', { error });
    throw error;
  }
}

module.exports = connectDB;
