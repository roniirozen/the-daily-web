const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const CommentRateLimit = require('../models/CommentRateLimit');
const Session = require('../models/Session');
const ViewStat = require('../models/ViewStat');
const { hashPassword, verifyPassword } = require('../utils/password');
const { hashSessionToken } = require('../utils/sessionToken');

test('release HTTP matrix against isolated MongoDB', { timeout: 120000 }, async t => {
  const dbName = 'daily_web_test_' + randomBytes(8).toString('hex');
  const password = 'test-' + randomBytes(16).toString('hex');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.name === dbName && /^daily_web_test_[a-f0-9]+$/.test(dbName)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await mongoose.connect('mongodb://127.0.0.1:27017/' + dbName);
  await Promise.all([User, Article, Comment, CommentRateLimit, Session, ViewStat].map(model => model.init()));
  const { hash, salt } = await hashPassword(password);
  const [reporter, otherReporter, editor] = await User.create([
    { username: 'release_reporter', role: 'reporter' }, { username: 'other_reporter', role: 'reporter' }, { username: 'release_editor', role: 'editor' }
  ].map(user => ({ ...user, passwordHash: hash, passwordSalt: salt })));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(url, status, { cookie, method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(base + url, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${url}: ${text.slice(0, 120)}`);
    return { response, text, data: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null };
  }
  async function login(username, suppliedPassword = password, expected = 302) {
    const result = await request('/login', expected, { method: 'POST', body: { username, password: suppliedPassword } });
    return result.response.headers.get('set-cookie')?.split(';')[0];
  }
  await request('/', 200); await request('/login', 200);
  await request('/reporter', 302); await request('/editor', 401); await request('/editor/users', 401);
  await login('missing', password, 401);
  const reporterCookie = await login(reporter.username);
  const otherCookie = await login(otherReporter.username);
  const editorCookie = await login(editor.username);
  await request('/editor/users', 403, { cookie: reporterCookie });
  await request('/reporter', 403, { cookie: editorCookie });

  await t.test('Reporter ownership, autosave, returns, approval and published revisions', async () => {
    const created = await request('/reporter/articles', 201, { cookie: reporterCookie, method: 'POST', body: { title: 'Incomplete', status: 'published', reporter: otherReporter._id } });
    const id = created.data.articleId;
    t.articleId = id;
    const route = '/reporter/articles/' + id;
    assert.equal(String((await Article.findById(id)).reporter), String(reporter._id));
    await request('/articles/' + id, 404);
    await request(route + '/autosave', 404, { cookie: otherCookie, method: 'PATCH', body: { title: 'Stolen' } });
    await request(route + '/autosave', 200, { cookie: reporterCookie, method: 'PATCH', body: { content: 'Saved incomplete text' } });
    assert((await request(route + '/edit', 200, { cookie: reporterCookie })).text.includes('Saved incomplete text'));
    await request(route + '/submit', 400, { cookie: reporterCookie, method: 'POST' });
    const version = { title: 'Approved original headline', summary: 'Original summary', content: '<script>window.exposed=true</script> public body', category: 'Science', imageUrl: '' };
    await request(route + '/autosave', 200, { cookie: reporterCookie, method: 'PATCH', body: version });
    await request(route + '/submit', 200, { cookie: reporterCookie, method: 'POST' });
    await request(route + '/autosave', 409, { cookie: reporterCookie, method: 'PATCH', body: { title: 'Illegal edit' } });
    let article = await Article.findById(id);
    const review = '/editor/articles/' + id;
    await request(review + '/return', 400, { cookie: editorCookie, method: 'POST', body: { revision: article.updatedAt.toISOString(), editorNote: '' } });
    await request(review + '/return', 303, { cookie: editorCookie, method: 'POST', body: { revision: article.updatedAt.toISOString(), editorNote: 'Explain the source.' } });
    assert((await request(route + '/edit', 200, { cookie: reporterCookie })).text.includes('Explain the source.'));
    await request(route + '/autosave', 200, { cookie: reporterCookie, method: 'PATCH', body: { summary: 'Sources added' } });
    await request(route + '/submit', 200, { cookie: reporterCookie, method: 'POST' });
    article = await Article.findById(id);
    const oldRevision = article.updatedAt.toISOString();
    await request(review + '/edit', 303, { cookie: editorCookie, method: 'POST', body: { ...version, revision: oldRevision } });
    await request(review + '/approve', 409, { cookie: editorCookie, method: 'POST', body: { revision: oldRevision } });
    article = await Article.findById(id);
    await request(review + '/approve', 303, { cookie: editorCookie, method: 'POST', body: { revision: article.updatedAt.toISOString() } });
    const page = await request('/articles/' + id, 200);
    assert(page.text.includes('&lt;script&gt;')); assert(!page.text.includes('<script>window.exposed'));
    await request(route + '/autosave', 200, { cookie: reporterCookie, method: 'PATCH', body: { title: 'New revised headline' } });
    assert((await request('/articles/' + id, 200)).text.includes('Approved original headline'));
    await request(route + '/submit', 200, { cookie: reporterCookie, method: 'POST' });
    assert(!(await request('/articles/' + id, 200)).text.includes('New revised headline'));
    article = await Article.findById(id);
    await request(review + '/approve', 303, { cookie: editorCookie, method: 'POST', body: { revision: article.updatedAt.toISOString() } });
    assert((await request('/articles/' + id, 200)).text.includes('New revised headline'));
    article = await Article.findById(id);
    assert.deepEqual(article.publicationHistory.map(entry => entry.type), ['initial', 'update']);
    await request(review + '/approve', 409, { cookie: editorCookie, method: 'POST', body: { revision: article.updatedAt.toISOString() } });
  });

  await t.test('Comment CRUD, rolling rate limit, header spoofing and pagination', async () => {
    const route = '/api/articles/' + t.articleId + '/comments';
    await request(route, 400, { method: 'POST', body: { authorName: [], content: 'Invalid author' } });
    const commentIds = [];
    for (let i = 0; i < 3; i++) commentIds.push((await request(route, 201, { method: 'POST', body: { authorName: 'Guest', content: 'Comment ' + i } })).data.comment._id);
    const limited = await request(route, 429, { method: 'POST', headers: { 'User-Agent': 'changed', 'X-Forwarded-For': '198.51.100.1' }, body: { authorName: 'Guest', content: 'Fourth', deviceId: randomBytes(8).toString('hex') } });
    assert(Number(limited.response.headers.get('retry-after')) > 0);
    await request('/api/comments/' + commentIds[0], 401, { method: 'PATCH', body: { content: 'Unauthorized' } });
    await request('/api/comments/' + commentIds[0], 403, { cookie: reporterCookie, method: 'DELETE' });
    await request('/api/comments/' + commentIds[0], 200, { cookie: editorCookie, method: 'PATCH', body: { content: 'Moderated' } });
    await request('/api/comments/' + commentIds[0], 200, { cookie: editorCookie, method: 'DELETE' });
    await request(route, 429, { method: 'POST', body: { authorName: 'Guest', content: 'Deleted comment must not reset quota' } });
    await CommentRateLimit.deleteMany({});
    const statuses = await Promise.all(Array.from({ length: 10 }, async () => {
      const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: 'Concurrent guest', content: 'Concurrent comment' }) });
      await response.text(); return response.status;
    }));
    assert.equal(statuses.filter(status => status === 201).length, 3);
    assert.equal(statuses.filter(status => status === 429).length, 7);
    await CommentRateLimit.updateMany({}, { $set: { attempts: [new Date(Date.now() - 61000)] } });
    await request(route, 201, { method: 'POST', body: { authorName: 'Guest', content: 'Quota expires after one minute' } });
    await Comment.insertMany(Array.from({ length: 60 }, (_, i) => ({ article: t.articleId, authorName: 'Fixture', content: 'Page item ' + i, deviceFingerprint: '0'.repeat(64) })));
    const first = (await request(route, 200)).data;
    assert.equal(first.comments.length, 50); assert(first.hasMore);
    const second = (await request(route + '?cursor=' + first.nextCursor, 200)).data;
    assert(second.comments.length > 0); assert(!second.hasMore);
    assert.equal(new Set([...first.comments, ...second.comments].map(comment => comment._id)).size, await Comment.countDocuments({ article: t.articleId }));
    assert(!JSON.stringify(first).includes('deviceFingerprint'));
  });

  await t.test('Concurrent autosave and submission preserve a validated pending version', async () => {
    const created = await request('/reporter/articles', 201, { cookie: reporterCookie, method: 'POST', body: { title: 'Concurrent story', summary: 'Valid summary', content: 'Valid body', category: 'Science' } });
    const route = '/reporter/articles/' + created.data.articleId;
    const results = await Promise.all([
      fetch(base + route + '/autosave', { method: 'PATCH', headers: { cookie: reporterCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Latest concurrent content' }) }),
      fetch(base + route + '/submit', { method: 'POST', headers: { cookie: reporterCookie } })
    ]);
    for (const response of results) { assert([200, 409].includes(response.status)); await response.text(); }
    if ((await Article.findById(created.data.articleId)).status !== 'pending') await request(route + '/submit', 200, { method: 'POST', cookie: reporterCookie });
    const pending = await Article.findById(created.data.articleId);
    assert.equal(pending.status, 'pending'); assert(pending.workingVersion.content); assert.equal(pending.publishedVersion, null);
    await request(route + '/autosave', 409, { method: 'PATCH', cookie: reporterCookie, body: { content: 'Too late' } });
  });

  await t.test('Editor User CRUD, password reset and account guards', async () => {
    const created = await request('/editor/users', 303, { cookie: editorCookie, method: 'POST', body: { username: 'new_reporter', role: 'reporter', password } });
    const id = created.response.headers.get('location').split('/')[3];
    let user = await User.findById(id);
    assert.notEqual(user.passwordHash, password); assert(await verifyPassword(password, user.passwordSalt, user.passwordHash));
    const oldCookie = await login(user.username);
    const list = (await request('/editor/users?search=new_', 200, { cookie: editorCookie })).text;
    assert(list.includes('new_reporter')); assert(!list.includes(user.passwordHash)); assert(!list.includes(user.passwordSalt));
    const newPassword = password + '-reset';
    await request('/editor/users/' + id + '/edit', 303, { cookie: editorCookie, method: 'POST', body: { username: 'renamed_editor', role: 'editor', password: newPassword, revision: user.updatedAt.toISOString() } });
    assert.equal(await Session.countDocuments({ tokenHash: hashSessionToken(oldCookie.split('=')[1]) }), 0);
    await login('renamed_editor', password, 401); const changedCookie = await login('renamed_editor', newPassword);
    await request('/editor', 200, { cookie: changedCookie });
    user = await User.findById(id);
    await request('/editor/users/' + id + '/delete', 303, { cookie: editorCookie, method: 'POST', body: { revision: user.updatedAt.toISOString(), confirmation: user.username } });
    assert.equal(await User.findById(id), null);
    const self = await User.findById(editor._id);
    await request('/editor/users/' + editor._id + '/delete', 409, { cookie: editorCookie, method: 'POST', body: { revision: self.updatedAt.toISOString(), confirmation: self.username } });
    await request('/editor/users/' + editor._id + '/edit', 409, { cookie: editorCookie, method: 'POST', body: { revision: self.updatedAt.toISOString(), username: self.username, role: 'reporter' } });
  });

  await t.test('View statistics full CRUD, analytics history and article cleanup', async () => {
    const route = '/editor/analytics/' + t.articleId + '/stats';
    await request(route, 401); await request(route, 403, { cookie: reporterCookie });
    await request(route, 400, { cookie: editorCookie, method: 'POST', body: { bucketStart: 'invalid', viewCount: 5 } });
    const created = await request(route, 201, { cookie: editorCookie, method: 'POST', body: { bucketStart: '2025-01-01T12:00:00Z', viewCount: 10 } });
    const id = created.data.record._id;
    await request(route + '/' + id, 200, { cookie: editorCookie });
    await request(route + '/' + id, 400, { cookie: editorCookie, method: 'PATCH', body: { viewCount: -1 } });
    await request(route + '/' + id, 200, { cookie: editorCookie, method: 'PATCH', body: { viewCount: 15 } });
    const analytics = (await request('/editor/analytics/' + t.articleId + '/data', 200, { cookie: editorCookie })).data;
    assert.equal(analytics.publicationHistory.length, 2); assert(analytics.timeline.some(point => point.viewCount === 15));
    await request(route + '/' + id, 200, { cookie: editorCookie, method: 'DELETE' });
    await request(route + '/' + id, 404, { cookie: editorCookie });
    await request('/editor/articles/' + t.articleId + '/delete', 303, { cookie: editorCookie, method: 'POST' });
    assert.equal(await Comment.countDocuments({ article: t.articleId }), 0);
    assert.equal(await ViewStat.countDocuments({ article: t.articleId }), 0);
    await request('/articles/' + t.articleId, 404);
  });

  await t.test('Concurrent Editor administration cannot demote both active actors', async () => {
    const actors = [];
    for (const username of ['concurrent_editor_a', 'concurrent_editor_b']) {
      await request('/editor/users', 303, { cookie: editorCookie, method: 'POST', body: { username, role: 'editor', password } });
      actors.push({ user: await User.findOne({ username }), cookie: await login(username) });
    }
    const responses = await Promise.all(actors.map((actor, i) => {
      const target = actors[1 - i].user;
      return fetch(base + '/editor/users/' + target._id + '/edit', { method: 'POST', redirect: 'manual', headers: { cookie: actor.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: target.username, role: 'reporter', revision: target.updatedAt.toISOString() }) });
    }));
    assert.deepEqual(responses.map(response => response.status).sort(), [303, 403]);
    for (const response of responses) await response.text();
    assert.equal(await User.countDocuments({ _id: { $in: actors.map(actor => actor.user._id) }, role: 'editor' }), 1);
  });

  await t.test('2000 articles: bounded feed/dashboard, combined criteria and indexes', async () => {
    const articles = await Article.insertMany(Array.from({ length: 2000 }, (_, i) => {
      const publicVersion = { title: `Falcon report ${i}`, summary: 'Published summary', content: 'Public content', category: i % 2 ? 'Science' : 'Technology' };
      return { reporter: reporter._id, status: i % 3 ? 'published' : 'pending', workingVersion: { ...publicVersion, title: 'PRIVATE TITLE' }, publishedVersion: publicVersion, publishedAt: new Date(Date.now() - i * 10000), totalViews: i };
    }));
    const first = (await request('/api/feed', 200)).data;
    assert.equal(first.articles.length, 20); assert(first.hasMore);
    const second = (await request('/api/feed?cursor=' + first.nextCursor, 200)).data;
    assert.equal(second.articles.length, 20);
    assert.equal(new Set([...first.articles, ...second.articles].map(article => article.id)).size, 40);
    assert(!JSON.stringify(first).includes('PRIVATE TITLE'));
    const viewedIds = articles.slice(0, 60).map(article => String(article._id));
    const combined = (await request('/api/feed?q=Falcon&category=Science&viewed=viewed&sort=popularity&viewedIds=' + viewedIds.join(','), 200)).data;
    assert.equal(combined.articles.length, 20);
    assert(combined.articles.every(article => article.category === 'Science' && viewedIds.includes(article.id)));
    assert(combined.articles.every((article, i, rows) => !i || rows[i - 1].totalViews >= article.totalViews));
    const unviewed = (await request('/api/feed?viewed=unviewed&viewedIds=' + viewedIds.join(','), 200)).data;
    assert(unviewed.articles.every(article => !viewedIds.includes(article.id)));
    await request('/api/feed?sort=invalid', 400);
    const long = (await request('/api/feed', 200, { method: 'POST', body: { viewed: 'viewed', viewedIds: articles.map(article => String(article._id)).join(',') } })).data;
    assert.equal(long.articles.length, 20);
    const desk = (await request('/editor?status=pending&page=2', 200, { cookie: editorCookie })).text;
    assert.equal((desk.match(/class="review-link"/g) || []).length, 20);
    assert((await request('/editor?search=PRIVATE', 200, { cookie: editorCookie })).text.includes('PRIVATE TITLE'));
    const reporterDesk = (await request('/reporter?page=2', 200, { cookie: reporterCookie })).text;
    assert.equal((reporterDesk.match(/class="workspace-card story-row"/g) || []).length, 20);
    const plan = await Article.find({ publishedVersion: { $ne: null } }).sort({ publishedAt: -1, _id: -1 }).limit(21).explain('executionStats');
    assert(plan.executionStats.totalDocsExamined <= 30);
    t.diagnostic(`Feed query examined ${plan.executionStats.totalDocsExamined} documents for 21 results out of 2000.`);
  });
  await request('/logout', 302, { cookie: reporterCookie, method: 'POST' });
  await request('/reporter', 302, { cookie: reporterCookie });
  await request('/articles/invalid', 400);
  await request('/missing', 404);
});
