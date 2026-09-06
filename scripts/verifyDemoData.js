const mongoose = require('mongoose');
const Article = require('../models/Article');
const User = require('../models/User');
const ViewStat = require('../models/ViewStat');
const Comment = require('../models/Comment');
const logger = require('../utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/web-daily-demo';
const DAY_MS = 24 * 60 * 60 * 1000;
const INFINITE_SCROLL_MINIMUM = 60;

function result(label, passed, details) {
  const prefix = passed ? 'PASS' : 'FAIL';
  console.log(`${prefix.padEnd(4)} ${label}: ${details}`);
  return passed;
}

async function getViewStatSummary() {
  const [summary] = await ViewStat.aggregate([
    {
      $group: {
        _id: null,
        documents: { $sum: 1 },
        articleIds: { $addToSet: '$article' },
        totalViews: { $sum: '$viewCount' },
        earliestBucket: { $min: '$bucketStart' },
        latestBucket: { $max: '$bucketStart' }
      }
    },
    {
      $project: {
        _id: 0,
        documents: 1,
        articles: { $size: '$articleIds' },
        totalViews: 1,
        earliestBucket: 1,
        latestBucket: 1
      }
    }
  ]);

  return summary || {
    documents: 0,
    articles: 0,
    totalViews: 0,
    earliestBucket: null,
    latestBucket: null
  };
}

async function verifyComments(checks) {
  const commentCount = await Comment.countDocuments();
  checks.push(result('Comments', commentCount > 0, `${commentCount} comments`));
}

async function verifyIntegrity(checks) {
  const [users, articles, totals, comments] = await Promise.all([
    User.find().select('role passwordHash passwordSalt').lean(),
    Article.find().select('reporter status editorNote publishedAt publishedVersion.title publicationHistory totalViews').lean(),
    ViewStat.aggregate([{ $group: { _id: '$article', count: { $sum: '$viewCount' } } }]),
    Comment.find().select('article authorName content').lean()
  ]);
  const userIds = new Set(users.map(user => String(user._id)));
  const editorIds = new Set(users.filter(user => user.role === 'editor').map(user => String(user._id)));
  const publicIds = new Set(articles.filter(article => article.publishedVersion).map(article => String(article._id)));
  const viewTotals = new Map(totals.map(row => [String(row._id), row.count]));
  checks.push(result('Password storage', users.every(user => /^[a-f0-9]{128}$/.test(user.passwordHash) && /^[a-f0-9]{32}$/.test(user.passwordSalt)), 'scrypt hashes and individual salts; no values printed'));
  checks.push(result('Article authors', articles.every(article => userIds.has(String(article.reporter))), 'all reporter references resolve'));
  checks.push(result('Returned correction notes', articles.filter(article => article.status === 'returned').every(article => Boolean(article.editorNote?.trim())), 'all returned articles have a note'));
  const validHistory = articles.every(article => {
    const history = article.publicationHistory || [];
    if (!article.publishedVersion) return history.length === 0;
    return history.length > 0 && history[0].type === 'initial' &&
      history.every((entry, i) => editorIds.has(String(entry.editor)) && (!i || (entry.type === 'update' && entry.approvedAt >= history[i - 1].approvedAt))) &&
      Number(article.publishedAt) === Number(history.at(-1).approvedAt);
  });
  checks.push(result('Approval history integrity', validHistory, 'chronological approvals, existing Editors, matching latest publication date'));
  checks.push(result('Public revisions', ['draft', 'pending', 'returned'].every(status => articles.some(article => article.status === status && article.publishedVersion)), 'approved snapshots survive all revision states'));
  checks.push(result('Comment references and content', comments.every(comment => publicIds.has(String(comment.article)) && comment.authorName?.trim() && comment.content?.trim()), 'comments refer to approved public articles'));
  checks.push(result('View statistics references', totals.every(row => publicIds.has(String(row._id))), 'statistics refer to approved public articles'));
  checks.push(result('Popularity totals', articles.every(article => article.totalViews === (viewTotals.get(String(article._id)) || 0)), 'article totals equal their hourly bucket sums'));
}

async function verifyDemoData() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB database: ${mongoose.connection.name}\n`);

  try {
    const [
      articleCount,
      reporterCount,
      editorCount,
      statusCounts,
      categories,
      multipleApprovalCount,
      multipleUpdateCount,
      publishedSnapshotCount,
      completePublishedSnapshotCount,
      viewStats,
      demoUsers
    ] = await Promise.all([
      Article.countDocuments(),
      User.countDocuments({ role: 'reporter' }),
      User.countDocuments({ role: 'editor' }),
      Article.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Article.distinct('publishedVersion.category', {
        publishedVersion: { $exists: true, $ne: null }
      }),
      Article.countDocuments({ 'publicationHistory.1': { $exists: true } }),
      Article.countDocuments({ 'publicationHistory.2': { $exists: true } }),
      Article.countDocuments({ publishedVersion: { $exists: true, $ne: null } }),
      Article.countDocuments({
        publishedVersion: { $exists: true, $ne: null },
        'publishedVersion.title': { $type: 'string', $ne: '' },
        'publishedVersion.summary': { $type: 'string', $ne: '' },
        'publishedVersion.content': { $type: 'string', $ne: '' },
        'publishedVersion.category': { $type: 'string', $ne: '' }
      }),
      getViewStatSummary(),
      User.find({ username: /^demo_/ }).select('username role -_id').sort({ username: 1 }).lean()
    ]);

    const byStatus = Object.fromEntries(statusCounts.map(row => [row._id, row.count]));
    const cleanCategories = categories.filter(Boolean).sort();
    const timelineDays = viewStats.earliestBucket && viewStats.latestBucket
      ? Math.floor((viewStats.latestBucket - viewStats.earliestBucket) / DAY_MS)
      : 0;
    const checks = [];

    console.log('DEMO DATA REQUIREMENTS');
    checks.push(result('Articles', articleCount >= 500, `${articleCount} total (minimum 500)`));
    checks.push(result('Reporters', reporterCount >= 2, `${reporterCount} total (minimum 2)`));
    checks.push(result('Editors', editorCount >= 1, `${editorCount} total (minimum 1)`));

    for (const status of ['draft', 'pending', 'returned', 'published']) {
      const count = byStatus[status] || 0;
      checks.push(result(`${status} articles`, count > 0, `${count} found`));
    }

    checks.push(result(
      'Categories',
      cleanCategories.length >= 3,
      `${cleanCategories.length} found: ${cleanCategories.join(', ') || 'none'}`
    ));
    checks.push(result(
      'Complete published snapshots',
      completePublishedSnapshotCount === publishedSnapshotCount && publishedSnapshotCount > 0,
      `${completePublishedSnapshotCount}/${publishedSnapshotCount} complete`
    ));
    checks.push(result(
      'Articles with multiple approvals',
      multipleApprovalCount >= 5,
      `${multipleApprovalCount} found (minimum 5)`
    ));
    checks.push(result(
      'Articles updated multiple times',
      multipleUpdateCount >= 5,
      `${multipleUpdateCount} contain at least three approvals`
    ));
    checks.push(result(
      'View statistics over time',
      viewStats.documents >= 100 && viewStats.articles >= 3 && timelineDays >= 7,
      `${viewStats.documents} buckets for ${viewStats.articles} articles across ${timelineDays} days; ` +
        `${viewStats.totalViews} represented views`
    ));
    checks.push(result(
      'Infinite-scroll inventory',
      publishedSnapshotCount >= INFINITE_SCROLL_MINIMUM,
      `${publishedSnapshotCount} public articles ` +
        `(${Math.floor(publishedSnapshotCount / 20)} complete 20-item loads)`
    ));

    await verifyComments(checks);
    await verifyIntegrity(checks);

    console.log('\nDEMO USERS');
    if (demoUsers.length) {
      for (const user of demoUsers) console.log(`  ${user.username} (${user.role})`);
    } else {
      console.log('  none found');
    }

    const passed = checks.every(Boolean);
    console.log(`\nDEMO DATA VERIFICATION: ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

verifyDemoData().catch(error => {
  logger.error('Demo verification failed', { error });
  process.exitCode = 1;
});
