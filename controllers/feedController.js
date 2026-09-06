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
    const query = req.method === 'POST' ? req.body : req.query;
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      return res.status(400).json({ message: 'Invalid feed criteria.' });
    }
    const limits = { q: 200, category: 80, viewed: 10, sort: 20, cursor: 512, viewedIds: 400000 };
    for (const [field, limit] of Object.entries(limits)) {
      if (query[field] !== undefined && (typeof query[field] !== 'string' || query[field].length > limit)) {
        return res.status(400).json({ message: 'Invalid feed criteria.' });
      }
    }
    if ((query.sort && !SORT_OPTIONS.includes(query.sort)) || (query.viewed && !VIEWED_OPTIONS.includes(query.viewed))) {
      return res.status(400).json({ message: 'Invalid feed criteria.' });
    }
    const sort = query.sort || 'date';
    const viewedFilter = query.viewed || 'all';

    const filter = { publishedVersion: { $exists: true, $ne: null } };

    if (query.category?.trim()) {
      filter['publishedVersion.category'] = query.category.trim();
    }

    if (query.q?.trim()) {
      filter.$text = { $search: query.q.trim() };
    }

    if (viewedFilter !== 'all') {
      const viewedIds = parseViewedIds(query.viewedIds);
      if (viewedIds.length) {
        filter._id = viewedFilter === 'viewed' ? { $in: viewedIds } : { $nin: viewedIds };
      } else if (viewedFilter === 'viewed') {
        // Client has viewed nothing locally yet: no article can match.
        return res.json({ articles: [], nextCursor: null, hasMore: false });
      }
    }

    const sortField = sort === 'popularity' ? 'totalViews' : 'publishedAt';

    let cursor = null;
    if (query.cursor) {
      cursor = decodeCursor(query.cursor);
      if (!cursor || !('value' in cursor) || !('id' in cursor) ||
          !mongoose.isObjectIdOrHexString(cursor.id)) {
        return res.status(400).json({ message: 'Invalid pagination cursor.' });
      }
    }

    if (cursor) {
      const cursorValue = sortField === 'publishedAt' ? new Date(cursor.value) : Number(cursor.value);
      if ((sortField === 'publishedAt' && (typeof cursor.value !== 'string' || !Number.isFinite(cursorValue.getTime()))) ||
          (sortField === 'totalViews' && (!Number.isSafeInteger(cursor.value) || cursor.value < 0))) {
        return res.status(400).json({ message: 'Invalid pagination cursor.' });
      }
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

exports.getCategories = async (req, res, next) => {
  try {
    const categories = await Article.distinct('publishedVersion.category', {
      publishedVersion: { $exists: true, $ne: null }
    });
    res.json({ categories: categories.filter(Boolean).sort() });
  } catch (error) { next(error); }
};
