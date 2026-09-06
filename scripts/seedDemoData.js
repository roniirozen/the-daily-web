const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const Session = require('../models/Session');
const User = require('../models/User');
const ViewStat = require('../models/ViewStat');
const { hashPassword } = require('../utils/password');
const logger = require('../utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/web-daily-demo';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date();

const ARTICLE_COUNTS = {
  published: 390,
  draft: 70,
  pending: 45,
  returned: 35
};

const CATEGORIES = [
  'Technology',
  'Business',
  'Science',
  'Health',
  'Culture',
  'Sports',
  'World',
  'Environment'
];

const DEMO_USERS = [
  { username: 'demo_reporter_1', password: 'DemoReporter!2026', role: 'reporter' },
  { username: 'demo_reporter_2', password: 'DemoReporter!2026', role: 'reporter' },
  { username: 'demo_reporter_3', password: 'DemoReporter!2026', role: 'reporter' },
  { username: 'demo_reporter_4', password: 'DemoReporter!2026', role: 'reporter' },
  { username: 'demo_editor_1', password: 'DemoEditor!2026', role: 'editor' },
  { username: 'demo_editor_2', password: 'DemoEditor!2026', role: 'editor' }
];

const SUBJECTS = [
  'community solar projects',
  'artificial intelligence research',
  'small business growth',
  'urban transportation',
  'coastal conservation',
  'public health clinics',
  'local football academies',
  'independent film production',
  'space exploration programs',
  'food security initiatives',
  'cybersecurity education',
  'renewable energy storage',
  'museum restoration projects',
  'medical device innovation',
  'international trade routes',
  'school science programs',
  'water management technology',
  'digital banking services',
  'wildlife recovery efforts',
  'professional basketball training'
];

const DEVELOPMENTS = [
  'reach a major milestone',
  'begin a new regional trial',
  'draw record public interest',
  'receive long-term funding',
  'publish encouraging early results',
  'expand into neighboring communities',
  'adopt a more sustainable approach',
  'prepare for a nationwide launch',
  'create new jobs and partnerships',
  'change how residents use local services',
  'open access to new participants',
  'report measurable gains this quarter'
];

const LOCATIONS = [
  'Jerusalem',
  'Tel Aviv',
  'Haifa',
  'Beersheba',
  'Galilee',
  'Negev',
  'Mediterranean coast',
  'Central District',
  'Northern District',
  'Southern District'
];

const RETURN_NOTES = [
  'Please verify the quoted figures and add a link to the primary source.',
  'The opening needs a clearer news angle before this can be approved.',
  'Add context from the affected community and correct the event timeline.',
  'Please shorten the summary and distinguish confirmed facts from estimates.',
  'The editor needs a second source for the central claim in paragraph three.'
];

const COMMENT_AUTHORS = [
  'Noa Levi',
  'Daniel Cohen',
  'Maya Barak',
  'Ari Katz',
  'Lior Shalev',
  'Rina David',
  'Sam Green',
  'Yael Amir',
  'Omer Tal',
  'Nina Brooks'
];

const COMMENT_TEXTS = [
  'This report gives useful context that was missing from earlier coverage.',
  'I would be interested in a follow-up once the next set of figures is released.',
  'The local perspective makes the wider impact much easier to understand.',
  'Thanks for explaining both the benefits and the remaining open questions.',
  'The timeline and source details helped clarify how this project developed.',
  'This is an encouraging result, although the long-term outcome still matters.',
  'Please continue tracking how the plan affects residents over the coming months.',
  'The comparison with previous efforts is especially helpful for readers.',
  'It is good to see concrete numbers alongside the interviews in this article.',
  'I shared this with colleagues who have been following the same subject.'
];

function daysAgo(days, extraHours = 0) {
  return new Date(NOW.getTime() - days * DAY_MS - extraHours * HOUR_MS);
}

function buildVersion(index, revision = 0, draftLabel = false) {
  const subject = SUBJECTS[index % SUBJECTS.length];
  const development = DEVELOPMENTS[Math.floor(index / SUBJECTS.length) % DEVELOPMENTS.length];
  const location = LOCATIONS[Math.floor(index / 7) % LOCATIONS.length];
  const category = CATEGORIES[index % CATEGORIES.length];
  const storyNumber = String(index + 1).padStart(3, '0');
  const revisionText = revision ? `, revision ${revision}` : '';
  const draftPrefix = draftLabel ? 'Developing: ' : '';

  return {
    title: `${draftPrefix}${subject} ${development} in ${location} — Report ${storyNumber}`,
    summary: `A ${category.toLowerCase()} report from ${location} examines how ${subject} ` +
      `${development}${revisionText}, who is affected, and what happens next.`,
    content: [
      `${location} — Report ${storyNumber} follows ${subject} as they ${development}. ` +
        `Interviews with organizers, residents, and independent specialists show how the project ` +
        `has changed during revision ${revision}.`,
      `The latest figures cover funding, participation, and measurable results. Analysts say the ` +
        `${category.toLowerCase()} implications will depend on implementation during the next ` +
        `${3 + (index % 9)} months.`,
      `Local participants described practical benefits as well as unresolved questions. The Daily ` +
        `Web will continue following this story and will update Report ${storyNumber} when new ` +
        `verified information becomes available.`
    ].join('\n\n'),
    imageUrl: `https://picsum.photos/seed/daily-web-${index + 1}/1200/675`,
    category
  };
}

function statusFor(index) {
  let offset = index;
  for (const status of ['published', 'draft', 'pending', 'returned']) {
    if (offset < ARTICLE_COUNTS[status]) return { status, statusIndex: offset };
    offset -= ARTICLE_COUNTS[status];
  }
  throw new Error(`No status configured for article ${index}`);
}

function approvalHistory(index, status, statusIndex, editors) {
  if (status === 'published' && statusIndex < 48) {
    const entries = [
      { approvedAt: daysAgo(30, index % 12), editor: editors[0]._id, type: 'initial' },
      { approvedAt: daysAgo(20, index % 10), editor: editors[1]._id, type: 'update' },
      { approvedAt: daysAgo(8, index % 8), editor: editors[0]._id, type: 'update' }
    ];

    if (statusIndex % 3 === 0) {
      entries.push({
        approvedAt: daysAgo(2, index % 6),
        editor: editors[1]._id,
        type: 'update'
      });
    }
    return entries;
  }

  const hasPublishedSnapshot =
    status === 'published' ||
    (status === 'draft' && statusIndex < 24) ||
    (status === 'pending' && statusIndex < 12) ||
    (status === 'returned' && statusIndex < 8);

  if (!hasPublishedSnapshot) return [];

  const initialDaysAgo = status === 'published'
    ? 1 + ((index * 11) % 210)
    : 38 + (statusIndex % 20);
  const entries = [{
    approvedAt: daysAgo(initialDaysAgo, index % 18),
    editor: editors[index % editors.length]._id,
    type: 'initial'
  }];

  if (status !== 'published' && statusIndex < 6) {
    entries.push({
      approvedAt: daysAgo(14 + (statusIndex % 5), index % 9),
      editor: editors[(index + 1) % editors.length]._id,
      type: 'update'
    });
  }

  return entries;
}

function buildArticle(index, reporters, editors) {
  const { status, statusIndex } = statusFor(index);
  const history = approvalHistory(index, status, statusIndex, editors);
  const latestRevision = Math.max(0, history.length - 1);
  const publishedVersion = history.length ? buildVersion(index, latestRevision) : null;
  const hasUnapprovedWork = status !== 'published';
  const workingVersion = hasUnapprovedWork
    ? buildVersion(index, latestRevision + 1, status === 'draft')
    : { ...publishedVersion };
  const updatedAt = status === 'published'
    ? history[history.length - 1].approvedAt
    : daysAgo(statusIndex % 11, index % 20);
  const createdAt = history.length
    ? new Date(history[0].approvedAt.getTime() - (4 + (index % 30)) * DAY_MS)
    : new Date(updatedAt.getTime() - (5 + (index % 90)) * DAY_MS);

  return {
    _id: new mongoose.Types.ObjectId(),
    reporter: reporters[index % reporters.length]._id,
    status,
    workingVersion,
    publishedVersion,
    editorNote: status === 'returned' ? RETURN_NOTES[statusIndex % RETURN_NOTES.length] : '',
    publishedAt: history.length ? history[history.length - 1].approvedAt : null,
    publicationHistory: history,
    lastAutosavedAt: updatedAt,
    totalViews: 0,
    createdAt,
    updatedAt
  };
}

function startOfUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function buildViewStats(article, articleIndex) {
  if (!article.publishedVersion || !article.publicationHistory.length) return [];

  const firstApproval = article.publicationHistory[0].approvedAt;
  const earliestWindow = daysAgo(30);
  const timelineStart = firstApproval > earliestWindow ? firstApproval : earliestWindow;
  const firstDay = startOfUtcDay(timelineStart);
  const lastDay = startOfUtcDay(NOW);
  const buckets = [];

  for (let dayStart = firstDay, dayIndex = 0;
    dayStart <= lastDay;
    dayStart += DAY_MS, dayIndex += 1) {
    for (const hour of [8, 19]) {
      const bucketStart = new Date(dayStart + hour * HOUR_MS);
      if (bucketStart < firstApproval || bucketStart > NOW) continue;

      const approvedUpdates = article.publicationHistory.filter(entry =>
        entry.type === 'update' && entry.approvedAt <= bucketStart
      ).length;
      const baseViews = 8 + ((articleIndex * 17 + dayIndex * 11 + hour) % 58);
      const popularityFactor = 1 + (articleIndex % 9) * 0.16;
      const updateFactor = 1 + approvedUpdates * 0.85;
      const viewCount = Math.round(baseViews * popularityFactor * updateFactor);

      buckets.push({
        article: article._id,
        bucketStart,
        viewCount
      });
    }
  }

  return buckets;
}

function buildComments(articles) {
  const publicArticles = articles.filter(article => article.publishedVersion);

  return publicArticles.flatMap((article, articleIndex) => {
    const commentCount = 1 + (articleIndex % 3);
    const firstApproval = article.publicationHistory[0].approvedAt;
    const availableTime = NOW.getTime() - firstApproval.getTime();

    return Array.from({ length: commentCount }, (_, commentIndex) => {
      const progress = (commentIndex + 1) / (commentCount + 1);
      const createdAt = new Date(firstApproval.getTime() + availableTime * progress);
      const category = article.publishedVersion.category.toLowerCase();

      return {
        article: article._id,
        authorName: COMMENT_AUTHORS[(articleIndex + commentIndex) % COMMENT_AUTHORS.length],
        content: COMMENT_TEXTS[(articleIndex * 2 + commentIndex) % COMMENT_TEXTS.length] +
          ` I am following this ${category} story for future updates.`,
        deviceFingerprint: crypto
          .createHash('sha256')
          .update(`demo-comment-device-${articleIndex}-${commentIndex}`)
          .digest('hex'),
        createdAt,
        updatedAt: createdAt
      };
    });
  });
}

async function removePreviousDemoData() {
  const usernames = DEMO_USERS.map(user => user.username);
  const previousUsers = await User.find({ username: { $in: usernames } }).select('_id').lean();
  const previousUserIds = previousUsers.map(user => user._id);

  if (!previousUserIds.length) return;

  const previousArticles = await Article.find({
    reporter: { $in: previousUserIds }
  }).select('_id').lean();
  const previousArticleIds = previousArticles.map(article => article._id);

  if (previousArticleIds.length) {
    await Comment.deleteMany({ article: { $in: previousArticleIds } });
    await ViewStat.deleteMany({ article: { $in: previousArticleIds } });
    await Article.deleteMany({ _id: { $in: previousArticleIds } });
  }
  await Session.deleteMany({ user: { $in: previousUserIds } });
  await User.deleteMany({ _id: { $in: previousUserIds } });
}

async function createDemoUsers() {
  const users = await Promise.all(DEMO_USERS.map(async credentials => {
    const { salt, hash } = await hashPassword(credentials.password);
    return {
      _id: new mongoose.Types.ObjectId(),
      username: credentials.username,
      passwordHash: hash,
      passwordSalt: salt,
      role: credentials.role
    };
  }));

  await User.insertMany(users);
  return users;
}

async function insertInBatches(Model, documents, batchSize = 4000) {
  for (let start = 0; start < documents.length; start += batchSize) {
    await Model.insertMany(documents.slice(start, start + batchSize));
  }
}

function printCredentials() {
  console.log('\nDEMO ACCOUNTS — fake local accounts only; demo-only passwords are documented in README');
  for (const user of DEMO_USERS) {
    console.log(`  ${user.role.toUpperCase()}: ${user.username}`);
  }
}

async function seedDemoData() {
  if (process.env.DEMO_SEED !== 'true') {
    throw new Error(
      'Demo seed cancelled. Set DEMO_SEED=true to confirm replacement of existing demo records.'
    );
  }

  const databaseName = decodeURIComponent(MONGO_URI.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)(?:\?|$)/)?.[1] || '');
  if (!/^(web-daily-demo(?:-[a-z0-9]+)?|daily_web_test_[a-f0-9]+)$/.test(databaseName)) {
    throw new Error('Use a web-daily-demo database (or an isolated daily_web_test_ database).');
  }

  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);

  try {
    // Both explicit opt-in and an unmistakably disposable database name are
    // required before removing any demo-owned records. Never seed production.
    if (!/^(web-daily-demo(?:-[a-z0-9]+)?|daily_web_test_[a-f0-9]+)$/.test(mongoose.connection.name)) {
      throw new Error('Use a web-daily-demo database (or an isolated daily_web_test_ database).');
    }
    await Promise.all([User, Article, Comment, Session, ViewStat].map(Model => Model.init()));
    await removePreviousDemoData();
    const users = await createDemoUsers();
    const reporters = users.filter(user => user.role === 'reporter');
    const editors = users.filter(user => user.role === 'editor');
    const totalArticleCount = Object.values(ARTICLE_COUNTS).reduce((sum, count) => sum + count, 0);
    const articles = Array.from(
      { length: totalArticleCount },
      (_, index) => buildArticle(index, reporters, editors)
    );
    const viewStats = articles.flatMap(buildViewStats);
    const comments = buildComments(articles);
    const viewTotalsByArticle = new Map();

    for (const stat of viewStats) {
      const articleId = stat.article.toString();
      viewTotalsByArticle.set(
        articleId,
        (viewTotalsByArticle.get(articleId) || 0) + stat.viewCount
      );
    }
    for (const article of articles) {
      article.totalViews = viewTotalsByArticle.get(article._id.toString()) || 0;
    }

    await Article.insertMany(articles);
    await insertInBatches(ViewStat, viewStats);
    await insertInBatches(Comment, comments);

    const publishedSnapshots = articles.filter(article => article.publishedVersion).length;
    const multipleApprovalArticles = articles.filter(article =>
      article.publicationHistory.length >= 2
    ).length;
    const totalViews = viewStats.reduce((sum, stat) => sum + stat.viewCount, 0);

    console.log('\nDemo data seeded successfully');
    console.log(`  Users: ${users.length} (${reporters.length} reporters, ${editors.length} editors)`);
    console.log(`  Articles: ${articles.length}`);
    for (const [status, count] of Object.entries(ARTICLE_COUNTS)) {
      console.log(`    ${status}: ${count}`);
    }
    console.log(`  Published snapshots: ${publishedSnapshots}`);
    console.log(`  Articles with multiple approvals: ${multipleApprovalArticles}`);
    console.log(`  ViewStat documents: ${viewStats.length}`);
    console.log(`  Total represented views: ${totalViews}`);
    console.log(`  Comments: ${comments.length}`);
    console.log(`  Categories: ${CATEGORIES.join(', ')}`);
    printCredentials();
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoData().catch(error => {
  logger.error('Demo seed failed; check DEMO_SEED and the demo database name', { error });
  process.exitCode = 1;
});
