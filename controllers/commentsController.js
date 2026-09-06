const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const CommentRateLimit = require('../models/CommentRateLimit');
const { getCommentPage } = require('../services/commentQueries');
const logger = require('../utils/logger');

const RATE_LIMIT_MAX_COMMENTS = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const {
  AUTHOR_NAME_MAX_LENGTH,
  CONTENT_MAX_LENGTH
} = Comment;

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

  return crypto
    .createHash('sha256')
    // Changing a cookie, device ID, User-Agent or forwarded header cannot
    // reset this limit. Devices sharing a public address share a quota.
    .update(`comments-v2\0${ipAddress}`)
    .digest('hex');
}

/**
 * Persistence operations are kept separate from the HTTP handlers so every
 * mutation has one implementation and the routes can add authorization and
 * request validation without duplicating database access.
 */
async function listCommentsForArticle(articleId) {
  return (await getCommentPage(articleId)).comments;
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
  const now = new Date();
  const allowed = { $lt: [{ $size: '$attempts' }, RATE_LIMIT_MAX_COMMENTS] };
  const update = [
    { $set: { attempts: { $filter: {
      input: { $ifNull: ['$attempts', []] }, as: 'at',
      cond: { $gt: ['$$at', new Date(now.getTime() - RATE_LIMIT_WINDOW_MS)] }
    } } } },
    { $set: {
      allowed,
      attempts: { $cond: [allowed, { $concatArrays: ['$attempts', [now]] }, '$attempts'] },
      expiresAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS)
    } }
  ];
  let quota;
  try {
    quota = await CommentRateLimit.findOneAndUpdate({ _id: deviceFingerprint }, update, { upsert: true, new: true }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Two first requests may race to insert the same unique identity.
    quota = await CommentRateLimit.findOneAndUpdate({ _id: deviceFingerprint }, update, { new: true }).lean();
  }
  if (!quota?.allowed) {
    const retryAfter = Math.max(1, Math.ceil((new Date(quota?.attempts[0]).getTime() + RATE_LIMIT_WINDOW_MS - now.getTime()) / 1000)) || 60;
    logger.warn('Guest comment limit reached', { route: '/api/articles/:articleId/comments', status: 429 });
    throw new CommentRateLimitError(retryAfter);
  }
  // Reserving quota before insertion keeps concurrent requests bounded even
  // across server restarts. A database failure may conservatively use a slot.
  return createCommentForArticle({ articleId, authorName, content, deviceFingerprint });
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

    const page = await getCommentPage(req.params.articleId, req.query.cursor);
    return res.json({ ...page, comments: page.comments.map(serializeComment) });
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
