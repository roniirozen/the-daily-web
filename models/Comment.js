const mongoose = require('mongoose');

const AUTHOR_NAME_MAX_LENGTH = 60;
const CONTENT_MAX_LENGTH = 1000;

const commentSchema = new mongoose.Schema(
  {
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: true
    },

    authorName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: AUTHOR_NAME_MAX_LENGTH
    },

    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: CONTENT_MAX_LENGTH
    },

    // Only a one-way hash is stored. The raw request identifiers used to
    // produce it are never persisted.
    deviceFingerprint: {
      type: String,
      required: true,
      select: false,
      match: /^[a-f0-9]{64}$/
    }
  },
  {
    timestamps: true
  }
);

commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ deviceFingerprint: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
module.exports.AUTHOR_NAME_MAX_LENGTH = AUTHOR_NAME_MAX_LENGTH;
module.exports.CONTENT_MAX_LENGTH = CONTENT_MAX_LENGTH;
