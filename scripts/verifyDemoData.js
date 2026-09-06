const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const User = require('../models/User');
const ViewStat = require('../models/ViewStat');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/web-daily';
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
  const commentModelPath = path.join(__dirname, '..', 'models', 'Comment.js');

  if (!fs.existsSync(commentModelPath)) {
    console.log('COMMENTS: PENDING ROUND-2 COMMENTS BRANCH');
    return;
  }

  const Comment = require(commentModelPath);
  const commentCount = await Comment.countDocuments();
  checks.push(result('Comments', commentCount > 0, `${commentCount} comments`));
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
  console.error(`Verification failed: ${error.message}`);
  process.exitCode = 1;
});
