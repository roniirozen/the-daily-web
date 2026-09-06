const mongoose = require('mongoose');
const ViewStat = require('../models/ViewStat');

const HOUR_MS = 60 * 60 * 1000;

/*
  Buckets are aligned to the start of the hour. Rounding every view down to
  its hour means a busy article accumulates one upsert per hour instead of
  one document per view, so the collection stays small no matter how many
  reads happen.
*/
function bucketStartFor(date) {
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return new Date(Math.floor(time / HOUR_MS) * HOUR_MS);
}

function assertValidArticleId(articleId) {
  if (!mongoose.isObjectIdOrHexString(articleId)) {
    const error = new Error('Invalid article id.');
    error.status = 400;
    throw error;
  }
}

/*
  Records a single view as an atomic increment/upsert on the (article, hour)
  bucket. Safe under concurrent requests: MongoDB serializes the upsert per
  unique key, so no read-modify-write race between simultaneous readers.
*/
async function recordView(articleId, when = new Date()) {
  assertValidArticleId(articleId);
  const bucketStart = bucketStartFor(when);

  return ViewStat.findOneAndUpdate(
    { article: articleId, bucketStart },
    { $inc: { viewCount: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/*
  Returns the view-count timeline for an article, ordered oldest to newest,
  suitable for plotting directly. Optionally restrict to a date range.
*/
async function getTimeline(articleId, { from, to } = {}) {
  assertValidArticleId(articleId);

  const match = { article: new mongoose.Types.ObjectId(articleId) };
  if (from || to) {
    match.bucketStart = {};
    if (from) match.bucketStart.$gte = new Date(from);
    if (to) match.bucketStart.$lte = new Date(to);
  }

  return ViewStat.find(match).sort({ bucketStart: 1 }).lean();
}

/*
  Total views for an article, aggregated in MongoDB rather than summed in
  JavaScript so it stays cheap regardless of how many buckets exist.
*/
async function getTotalViews(articleId) {
  assertValidArticleId(articleId);

  const [result] = await ViewStat.aggregate([
    { $match: { article: new mongoose.Types.ObjectId(articleId) } },
    { $group: { _id: null, total: { $sum: '$viewCount' } } }
  ]);

  return result ? result.total : 0;
}

/*
  Total views for many articles at once (e.g. for popularity sorting on a
  feed page), returned as a Map keyed by article id string.
*/
async function getTotalViewsForArticles(articleIds) {
  const ids = articleIds
    .filter(id => mongoose.isObjectIdOrHexString(id))
    .map(id => new mongoose.Types.ObjectId(id));

  if (!ids.length) return new Map();

  const results = await ViewStat.aggregate([
    { $match: { article: { $in: ids } } },
    { $group: { _id: '$article', total: { $sum: '$viewCount' } } }
  ]);

  return new Map(results.map(row => [row._id.toString(), row.total]));
}

/*
  CRUD surface for the ViewStat collection. Recording views should go
  through recordView (atomic upsert); these are for direct administration
  and for demonstrating Create/Read/Update/Delete during the defense.
*/
async function createViewStat({ article, bucketStart, viewCount = 0 }) {
  assertValidArticleId(article);
  return ViewStat.create({ article, bucketStart: bucketStartFor(bucketStart), viewCount });
}

async function getViewStatById(id) {
  if (!mongoose.isObjectIdOrHexString(id)) return null;
  return ViewStat.findById(id).lean();
}

async function listViewStats({ article, limit = 100, skip = 0 } = {}) {
  const filter = {};
  if (article) {
    assertValidArticleId(article);
    filter.article = article;
  }
  return ViewStat.find(filter).sort({ bucketStart: -1 }).skip(skip).limit(limit).lean();
}

async function updateViewStat(id, { viewCount }) {
  if (!mongoose.isObjectIdOrHexString(id)) return null;
  return ViewStat.findByIdAndUpdate(id, { $set: { viewCount } }, { new: true });
}

async function deleteViewStat(id) {
  if (!mongoose.isObjectIdOrHexString(id)) return null;
  return ViewStat.findByIdAndDelete(id);
}

module.exports = {
  bucketStartFor,
  recordView,
  getTimeline,
  getTotalViews,
  getTotalViewsForArticles,
  createViewStat,
  getViewStatById,
  listViewStats,
  updateViewStat,
  deleteViewStat
};
