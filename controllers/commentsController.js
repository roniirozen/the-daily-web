const crypto = require('crypto');
const Comment = require('../models/Comment');

const RATE_LIMIT_MAX_COMMENTS = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

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

module.exports = {
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
