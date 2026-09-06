const Comment = require('../models/Comment');

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
  updateCommentById,
  deleteCommentById
};
