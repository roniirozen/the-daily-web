const mongoose = require('mongoose');
const Article = require('../models/Article');

const PAGE_SIZE = 20;
const SORT_OPTIONS = ['date', 'popularity'];
const VIEWED_OPTIONS = ['all', 'viewed', 'unviewed'];

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    return payload;
  } catch {
    return null;
  }
}

function parseViewedIds(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map(id => id.trim())
    .filter(id => mongoose.isObjectIdOrHexString(id))
    .map(id => new mongoose.Types.ObjectId(id));
}

/*
  Public feed endpoint. Only ever reads publishedVersion - workingVersion
  (the reporter/editor draft) is never selected or returned here, matching
  the same "publishedVersion exists" definition of "public" already used by
  controllers/publicController.js for the single-article page.
*/
exports.getFeed = async (req, res, next) => {
  try {
    const sort = SORT_OPTIONS.includes(req.query.sort) ? req.query.sort : 'date';
    const viewedFilter = VIEWED_OPTIONS.includes(req.query.viewed) ? req.query.viewed : 'all';

    const filter = { publishedVersion: { $exists: true, $ne: null } };

    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      filter['publishedVersion.category'] = req.query.category.trim();
    }

    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      filter.$text = { $search: req.query.q.trim() };
    }

    if (viewedFilter !== 'all') {
      const viewedIds = parseViewedIds(req.query.viewedIds);
      if (viewedIds.length) {
        filter._id = viewedFilter === 'viewed' ? { $in: viewedIds } : { $nin: viewedIds };
      } else if (viewedFilter === 'viewed') {
        // Client has viewed nothing locally yet: no article can match.
        return res.json({ articles: [], nextCursor: null, hasMore: false });
      }
    }

    const sortField = sort === 'popularity' ? 'totalViews' : 'publishedAt';

    let cursor = null;
    if (typeof req.query.cursor === 'string' && req.query.cursor) {
      cursor = decodeCursor(req.query.cursor);
      if (!cursor || !('value' in cursor) || !('id' in cursor) ||
          !mongoose.isObjectIdOrHexString(cursor.id)) {
        return res.status(400).json({ message: 'Invalid pagination cursor.' });
      }
    }

    if (cursor) {
      const cursorValue = sortField === 'publishedAt' ? new Date(cursor.value) : Number(cursor.value);
      filter.$or = [
        { [sortField]: { $lt: cursorValue } },
        { [sortField]: cursorValue, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }
      ];
    }

    // Query is executed entirely in MongoDB: filtering, sorting and paging
    // all happen server-side via the indexes on publishedAt / totalViews /
    // publishedVersion.category / publishedVersion text fields.
    const docs = await Article.find(filter)
      .select('publishedVersion.title publishedVersion.imageUrl publishedVersion.summary publishedVersion.category publishedAt totalViews reporter')
      .populate('reporter', 'username')
      .sort({ [sortField]: -1, _id: -1 })
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = docs.length > PAGE_SIZE;
    const page = docs.slice(0, PAGE_SIZE);

    const articles = page.map(doc => ({
      id: doc._id,
      title: doc.publishedVersion?.title || '',
      image: doc.publishedVersion?.imageUrl || '',
      summary: doc.publishedVersion?.summary || '',
      category: doc.publishedVersion?.category || '',
      reporter: doc.reporter?.username || 'Unknown reporter',
      publishedAt: doc.publishedAt,
      totalViews: doc.totalViews || 0
    }));

    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ value: last[sortField], id: last._id.toString() })
      : null;

    return res.json({ articles, nextCursor, hasMore });
  } catch (error) {
    return next(error);
  }
};
