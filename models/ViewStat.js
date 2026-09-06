const mongoose = require('mongoose');

/*
  One document per (article, hour) bucket instead of one document per view.
  A front page read thousands of times an hour still produces a single
  document that gets its viewCount incremented atomically, keeping the
  collection size proportional to (articles x hours) rather than (views).
*/
const viewStatSchema = new mongoose.Schema(
  {
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: true
    },

    bucketStart: {
      type: Date,
      required: true
    },

    viewCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

viewStatSchema.index({ article: 1, bucketStart: 1 }, { unique: true });

module.exports = mongoose.model('ViewStat', viewStatSchema);
