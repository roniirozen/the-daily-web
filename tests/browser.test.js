const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const Article = require('../models/Article');
const Session = require('../models/Session');
const ViewStat = require('../models/ViewStat');
const { hashSessionToken } = require('../utils/sessionToken');
const { openBrowser } = require('./helpers/browser');

test('real browser: feed races, infinite scrolling, comments, autosave and responsive screens', { timeout: 120000 }, async t => {
  const dbName = 'daily_web_test_' + randomBytes(8).toString('hex');
  let server;
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.name === dbName && /^daily_web_test_[a-f0-9]+$/.test(dbName)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await mongoose.connect('mongodb://127.0.0.1:27017/' + dbName);
  await Promise.all([User.init(), Article.init(), Session.init(), ViewStat.init()]);
  const reporter = await User.create({ username: 'browser_reporter', passwordSalt: 'test', passwordHash: 'test', role: 'reporter' });
  const editor = await User.create({ username: 'browser_editor', passwordSalt: 'test', passwordHash: 'test', role: 'editor' });
  const articles = await Article.insertMany(Array.from({ length: 65 }, (_, i) => {
    const version = { title: `${i < 40 ? 'Falcon' : 'Otter'} news ${i}`, category: i < 60 ? 'Technology' : 'Rare', summary: 'Public summary', content: 'Full server-rendered body', imageUrl: '' };
    const publishedAt = new Date(Date.now() - (i + 1) * 3600000);
    return { reporter: reporter._id, workingVersion: version, publishedVersion: version, publishedAt, status: 'published', publicationHistory: [{ editor: editor._id, type: 'initial', approvedAt: publishedAt }] };
  }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await openBrowser();
  await browser.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await browser.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__requests = [];
    const fetchOriginal = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]); window.__requests.push(url);
      if (url.startsWith('/api/feed?')) await new Promise(resolve => setTimeout(resolve, 350));
      return fetchOriginal(...args);
    };
  ` });
  await browser.navigate(base);
  await browser.waitFor('document.querySelectorAll(".article-card").length === 20');
  await browser.waitFor('Array.from(document.querySelector("#feed-category").options).some(option => option.value === "Rare")');
  await browser.evaluate('window.scrollTo(0, document.body.scrollHeight)');
  await browser.waitFor('document.querySelectorAll(".article-card").length === 40');
  const ids = await browser.evaluate('Array.from(document.querySelectorAll(".article-card"), card => card.dataset.articleId)');
  assert.equal(new Set(ids).size, 40);

  // Start a delayed old query, then replace it while it is in flight.
  await browser.evaluate(`window.scrollTo(0, 0); const q = document.querySelector('#feed-search'); q.value='Falcon'; q.dispatchEvent(new Event('input'));`);
  await new Promise(resolve => setTimeout(resolve, 400));
  await browser.evaluate(`document.querySelector('#feed-search').value='Otter'; document.querySelector('#feed-sort').value='popularity'; document.querySelector('#feed-sort').dispatchEvent(new Event('change'));`);
  await browser.waitFor('document.querySelectorAll(".article-card").length === 20 && Array.from(document.querySelectorAll(".article-card h3")).every(el => el.textContent.includes("Otter"))');
  await browser.evaluate('window.scrollTo(0, document.body.scrollHeight)');
  await browser.waitFor('document.querySelectorAll(".article-card").length === 25');
  assert.equal(await browser.evaluate('new Set(Array.from(document.querySelectorAll(".article-card"), el => el.dataset.articleId)).size'), 25);

  await browser.navigate(base + '/articles/' + articles[0]._id);
  await browser.waitFor('JSON.parse(localStorage.getItem("dailyWebViewedArticles")).length === 1');
  const before = await browser.evaluate('document.querySelectorAll(".comment").length');
  await browser.evaluate(`document.querySelector('#authorName').value='Browser reader'; document.querySelector('#content').value='<img src=x onerror=alert(1)> plain comment'; document.querySelector('#comment-form').requestSubmit();`);
  await browser.waitFor('document.querySelector("#comment-message").dataset.state === "success"');
  assert.equal(await browser.evaluate('document.querySelectorAll(".comment").length'), before + 1);
  assert.equal(await browser.evaluate('document.querySelectorAll(".comment img").length'), 0);
  assert.equal(await browser.evaluate('window.__requests.filter(url => url.includes("/comments")).length'), 1);

  async function loginAs(user) {
    const token = randomBytes(32).toString('hex');
    await Session.create({ user: user._id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 600000) });
    await browser.call('Network.setCookie', { name: 'session_token', value: token, url: base, httpOnly: true, sameSite: 'Lax' });
  }
  await loginAs(reporter);
  await browser.navigate(base + '/reporter/articles/new');
  await browser.evaluate(`document.querySelector('#title').value='Browser autosave draft'; document.querySelector('#title').dispatchEvent(new Event('input', { bubbles: true }));`);
  await browser.waitFor('document.querySelector("#save-message").textContent === "Saved"');
  const savedUrl = await browser.evaluate('location.href');
  await browser.navigate(savedUrl);
  assert.equal(await browser.evaluate('document.querySelector("#title").value'), 'Browser autosave draft');
  const screens = ['/', '/articles/' + articles[0]._id, '/reporter', savedUrl.slice(base.length)];
  async function assertLayout(route, width) {
    await browser.call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.navigate(base + route);
    const dimensions = await browser.evaluate('({ viewport: innerWidth, content: document.documentElement.scrollWidth })');
    const overflow = dimensions.content > dimensions.viewport + 1 ? await browser.evaluate('Array.from(document.querySelectorAll("body *")).filter(el => el.getBoundingClientRect().right > innerWidth && !el.closest(".table-scroll")).slice(0, 12).map(el => ({tag: el.tagName, classes: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, overflow: getComputedStyle(el).overflowX}))') : [];
    assert(dimensions.content <= dimensions.viewport + 1, `${route} overflows at ${width}px: ${dimensions.content}; ${JSON.stringify(overflow)}`);
    assert(await browser.evaluate('Boolean(document.querySelector("main"))'), route + ' has a main landmark');
  }
  for (const width of [375, 768, 1280]) for (const route of screens) await assertLayout(route, width);
  await loginAs(editor);
  for (const width of [375, 768, 1280]) {
    for (const route of ['/editor', '/editor/articles/' + articles[0]._id, '/editor/users', '/editor/users/new', '/editor/users/' + reporter._id + '/edit', '/editor/analytics/' + articles[0]._id]) await assertLayout(route, width);
  }
  await browser.call('Network.clearBrowserCookies');
  await assertLayout('/login', 375);
  assert.equal(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0);
});
