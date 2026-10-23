const mongoose = require('mongoose');

// One short-lived document per address, with its last (up to three) comment times.
const schema = new mongoose.Schema({
  _id: String,
  attempts: [Date],
  allowed: Boolean,
  expiresAt: { type: Date, index: { expires: 0 } }
}, { versionKey: false });

module.exports = mongoose.model('CommentRateLimit', schema);
