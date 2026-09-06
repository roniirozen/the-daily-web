const mongoose = require('mongoose');

const articleVersionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    summary: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    imageUrl: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      required: true,
      trim: true
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
      required: true
    },

    status: {
      type: String,
      enum: [
        'draft',
        'pending',
        'published',
        'returned'
      ],
      default: 'draft'
    },

    workingVersion: {
      type: articleVersionSchema,
      required: true
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

    lastAutosavedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Article', articleSchema);