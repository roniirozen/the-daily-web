const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/web-daily';

  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

module.exports = connectDB;
