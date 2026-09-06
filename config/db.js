const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/web-daily';

  try {
    await mongoose.connect(mongoUri);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection failed', { error });
    process.exit(1);
  }
}

module.exports = connectDB;
