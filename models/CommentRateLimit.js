const mongoose = require('mongoose');

// One short-lived document per network identity, with at most three dates.
// MongoDB serializes updates even when multiple Node processes serve comments.
const schema = new mongoose.Schema({
  _id: String,
  attempts: [Date],
  allowed: Boolean,
  expiresAt: { type: Date, index: { expires: 0 } }
}, { versionKey: false });

module.exports = mongoose.model('CommentRateLimit', schema);
