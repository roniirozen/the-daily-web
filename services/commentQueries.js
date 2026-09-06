const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const PAGE_SIZE = 50;

async function getCommentPage(articleId, cursor) {
  const filter = { article: articleId };
  if (cursor !== undefined) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 256) throw new Error();
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      const date = new Date(value.createdAt);
      if (!mongoose.isObjectIdOrHexString(value.id) || typeof value.createdAt !== 'string' || !Number.isFinite(date.getTime())) throw new Error();
      filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: value.id } }];
    } catch {
      const error = new Error('Invalid comment pagination cursor.');
      error.status = 400;
      throw error;
    }
  }
  const rows = await Comment.find(filter).select('article authorName content createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 }).limit(PAGE_SIZE + 1).lean();
  const hasMore = rows.length > PAGE_SIZE;
  const comments = rows.slice(0, PAGE_SIZE);
  const last = comments.at(-1);
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ id: last._id, createdAt: last.createdAt })).toString('base64url') : null;
  return { comments, hasMore, nextCursor };
}

module.exports = { getCommentPage, PAGE_SIZE };
