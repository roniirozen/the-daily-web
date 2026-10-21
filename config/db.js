const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { MONGO_URI } = require('./mongoUri');

mongoose.connection.on('error', error => logger.error('MongoDB connection error', { error }));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection failed', { error });
    throw error;
  }
}

module.exports = connectDB;
