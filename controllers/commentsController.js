const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');

const RATE_LIMIT_MAX_COMMENTS = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const {
  AUTHOR_NAME_MAX_LENGTH,
  CONTENT_MAX_LENGTH
} = Comment;

// Serializing checks for the same fingerprint prevents simultaneous requests
// handled by this process from all passing the same recent-comment query.
const fingerprintLocks = new Map();

class CommentRateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('You can post up to 3 comments per minute. Please try again shortly.');
    this.name = 'CommentRateLimitError';
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function createDeviceFingerprint(req) {
  // Express does not trust forwarded addresses by default. Prefer the socket
  // address so a guest cannot choose a new identity with a request header.
  const ipAddress = req.socket?.remoteAddress || req.ip || 'unknown-address';
  const userAgent = req.headers?.['user-agent'] || 'unknown-user-agent';

  return crypto
    .createHash('sha256')
    .update(`comments-v1\0${ipAddress}\0${userAgent}`)
    .digest('hex');
}

async function withFingerprintLock(fingerprint, operation) {
  const precedingOperation = fingerprintLocks.get(fingerprint) || Promise.resolve();
  let releaseLock;
  const currentOperation = new Promise(resolve => {
    releaseLock = resolve;
  });

  fingerprintLocks.set(fingerprint, currentOperation);
  await precedingOperation.catch(() => {});

  try {
    return await operation();
  } finally {
    releaseLock();
    if (fingerprintLocks.get(fingerprint) === currentOperation) {
      fingerprintLocks.delete(fingerprint);
    }
  }
}

/**
 * Persistence operations are kept separate from the HTTP handlers so every
 * mutation has one implementation and the routes can add authorization and
 * request validation without duplicating database access.
 */
async function listCommentsForArticle(articleId) {
  return Comment.find({ article: articleId })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
}

async function createCommentForArticle({
  articleId,
  authorName,
  content,
  deviceFingerprint
}) {
  return Comment.create({
    article: articleId,
    authorName,
    content,
    deviceFingerprint
  });
}

async function createRateLimitedGuestComment({
  articleId,
  authorName,
  content,
  deviceFingerprint
}) {
  return withFingerprintLock(deviceFingerprint, async () => {
    const now = Date.now();
    const windowStart = new Date(now - RATE_LIMIT_WINDOW_MS);
    const recentComments = await Comment.find({
      deviceFingerprint,
      createdAt: { $gt: windowStart }
    })
      .select('createdAt')
      .sort({ createdAt: 1 })
      .limit(RATE_LIMIT_MAX_COMMENTS)
      .lean();

    if (recentComments.length >= RATE_LIMIT_MAX_COMMENTS) {
      const oldestExpiry = new Date(recentComments[0].createdAt).getTime()
        + RATE_LIMIT_WINDOW_MS;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestExpiry - now) / 1000)
      );
      throw new CommentRateLimitError(retryAfterSeconds);
    }

    // Only successfully persisted comments count toward the next check.
    return createCommentForArticle({
      articleId,
      authorName,
      content,
      deviceFingerprint
    });
  });
}

async function updateCommentById(commentId, changes) {
  return Comment.findByIdAndUpdate(
    commentId,
    { $set: changes },
    { new: true, runValidators: true }
  );
}

async function deleteCommentById(commentId) {
  return Comment.findByIdAndDelete(commentId);
}

function validateObjectId(value, fieldName) {
  if (!mongoose.isObjectIdOrHexString(value)) {
    return `Invalid ${fieldName}.`;
  }
  return null;
}

function validateText(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    return `${fieldName} must be a string.`;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return `${fieldName} is required.`;
  }
  if (trimmedValue.length > maxLength) {
    return `${fieldName} must be at most ${maxLength} characters.`;
  }

  return null;
}

function serializeComment(comment) {
  return {
    _id: comment._id.toString(),
    article: comment.article.toString(),
    authorName: comment.authorName,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  };
}

async function publicArticleExists(articleId) {
  return Article.exists({
    _id: articleId,
    publishedVersion: { $exists: true, $ne: null }
  });
}

function handleControllerError(error, res, next) {
  if (error instanceof CommentRateLimitError) {
    res.set('Retry-After', String(error.retryAfterSeconds));
    return res.status(429).json({
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: 'Invalid comment data.' });
  }

  return next(error);
}

exports.requireEditor = (req, res, next) => {
  // loadCurrentUser runs before the already-mounted public router. Only that
  // server-verified session identity is used for these API permissions.
  if (!req.currentUser) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  if (req.currentUser.role !== 'editor') {
    return res.status(403).json({
      message: 'Editor permission is required for this operation.'
    });
  }
  return next();
};

exports.getArticleComments = async (req, res, next) => {
  try {
    const idError = validateObjectId(req.params.articleId, 'article ID');
    if (idError) return res.status(400).json({ message: idError });

    if (!await publicArticleExists(req.params.articleId)) {
      return res.status(404).json({ message: 'Published article not found.' });
    }

    const comments = await listCommentsForArticle(req.params.articleId);
    return res.json({ comments: comments.map(serializeComment) });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

exports.createComment = async (req, res, next) => {
  try {
    const idError = validateObjectId(req.params.articleId, 'article ID');
    if (idError) return res.status(400).json({ message: idError });

    const authorNameError = validateText(
      req.body?.authorName,
      'authorName',
      AUTHOR_NAME_MAX_LENGTH
    );
    if (authorNameError) {
      return res.status(400).json({ message: authorNameError });
    }

    const contentError = validateText(
      req.body?.content,
      'content',
      CONTENT_MAX_LENGTH
    );
    if (contentError) {
      return res.status(400).json({ message: contentError });
    }

    if (!await publicArticleExists(req.params.articleId)) {
      return res.status(404).json({ message: 'Published article not found.' });
    }

    const commentData = {
      articleId: req.params.articleId,
      authorName: req.body.authorName.trim(),
      content: req.body.content.trim(),
      deviceFingerprint: createDeviceFingerprint(req)
    };

    const comment = req.currentUser
      ? await createCommentForArticle(commentData)
      : await createRateLimitedGuestComment(commentData);

    return res.status(201).json({ comment: serializeComment(comment) });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

exports.updateComment = async (req, res, next) => {
  try {
    const idError = validateObjectId(req.params.commentId, 'comment ID');
    if (idError) return res.status(400).json({ message: idError });

    const changes = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'authorName')) {
      const authorNameError = validateText(
        req.body.authorName,
        'authorName',
        AUTHOR_NAME_MAX_LENGTH
      );
      if (authorNameError) {
        return res.status(400).json({ message: authorNameError });
      }
      changes.authorName = req.body.authorName.trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'content')) {
      const contentError = validateText(
        req.body.content,
        'content',
        CONTENT_MAX_LENGTH
      );
      if (contentError) {
        return res.status(400).json({ message: contentError });
      }
      changes.content = req.body.content.trim();
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({
        message: 'Provide authorName or content to update.'
      });
    }

    const comment = await updateCommentById(req.params.commentId, changes);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found.' });
    }

    return res.json({ comment: serializeComment(comment) });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const idError = validateObjectId(req.params.commentId, 'comment ID');
    if (idError) return res.status(400).json({ message: idError });

    const comment = await deleteCommentById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found.' });
    }

    return res.json({
      message: 'Comment deleted successfully.',
      comment: serializeComment(comment)
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

module.exports = {
  ...module.exports,
  listCommentsForArticle,
  createCommentForArticle,
  createRateLimitedGuestComment,
  updateCommentById,
  deleteCommentById,
  createDeviceFingerprint,
  CommentRateLimitError,
  RATE_LIMIT_MAX_COMMENTS,
  RATE_LIMIT_WINDOW_MS
};
