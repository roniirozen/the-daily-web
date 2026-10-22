const mongoose = require('mongoose');

// One document per article per hour, instead of one per view.
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
