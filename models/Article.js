const mongoose = require('mongoose');

const articleVersionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: ''
    },

    summary: {
      type: String,
      trim: true,
      default: ''
    },

    content: {
      type: String,
      default: ''
    },

    imageUrl: {
      type: String,
      trim: true,
      default: ''
    },

    category: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    _id: false
  }
);

const articleSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: ['draft', 'pending', 'published', 'returned'],
      default: 'draft',
      index: true
    },

    workingVersion: {
      type: articleVersionSchema,
      default: () => ({})
    },

    publishedVersion: {
      type: articleVersionSchema,
      default: null
    },

    editorNote: {
      type: String,
      default: ''
    },

    publishedAt: {
      type: Date,
      default: null
    },

    publicationHistory: {
      type: [new mongoose.Schema({
        approvedAt: { type: Date, required: true },
        editor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        type: {
          type: String,
          enum: ['initial', 'update'],
          required: true
        }
      }, { _id: false })],
      default: () => []
    },

    lastAutosavedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

articleSchema.index({ reporter: 1, status: 1 });
articleSchema.index({ publishedAt: -1 });

module.exports = mongoose.model('Article', articleSchema);
