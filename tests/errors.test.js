const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const requireApp = createRequire(path.join(process.cwd(), 'app.js'));
const mongoose = requireApp('mongoose');
const secret = 'private-error-value-346290';
const feedController = requireApp('./controllers/feedController');
const errors = {
  unexpected: () => new Error('Sensitive input\n    at ' + secret),
  syntax: () => new SyntaxError(secret),
  cast: () => new mongoose.Error.CastError('ObjectId', secret, '_id'),
  validation: () => new mongoose.Error.ValidationError(),
  duplicate: () => new mongoose.mongo.MongoServerError({ message: secret, code: 11000, keyValue: { password: secret } }),
  network: () => new mongoose.mongo.MongoNetworkError(secret),
  selection: () => new mongoose.Error.MongooseServerSelectionError(secret),
  version: () => Object.assign(new Error(secret), { name: 'VersionError' }),
  missingDocument: () => Object.assign(new Error(secret), { name: 'DocumentNotFoundError' }),
  explicit: () => Object.assign(new Error(secret), { status: 422 }),
  invalidStatus: () => Object.assign(new Error(secret), { status: 299 }),
  invalidName: () => Object.assign(new Error(secret), { name: 'invalid name ' + secret })
};

// Inject failures into an existing controller before app.js mounts it. This
// checks Express 5 rejected promises and the real application's error order.
feedController.getFeed = async (req, res) => {
  if (req.query.case === 'handled') return res.status(503).json({ message: 'Service unavailable' });
  if (req.query.case === 'partial') {
    res.write('partial response');
    await new Promise(resolve => setTimeout(resolve, 20));
    throw errors.unexpected();
  }
  throw errors[req.query.case]();
};

const { app } = requireApp('./app');
const logger = requireApp('./utils/logger');
let server;
const logfile = path.join(process.cwd(), 'logs', new Date().toISOString().slice(0, 10) + '.log');
const logOffset = fs.existsSync(logfile) ? fs.statSync(logfile).size : 0;
const captured = [];
const originalError = console.error;
const originalWarn = console.warn;
console.error = line => captured.push(line);
console.warn = line => captured.push(line);

async function main() {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  for (const mode of ['development', 'production']) {
    process.env.NODE_ENV = mode;
    for (const [name, expected] of Object.entries({ unexpected: 500, syntax: 500, cast: 400, validation: 400, duplicate: 409, network: 503, selection: 503, version: 409, missingDocument: 409, explicit: 422, invalidStatus: 500, invalidName: 500, handled: 503 })) {
      const response = await fetch(url + '/api/feed?case=' + name + '&password=' + secret);
      const body = await response.json();
      assert.equal(response.status, expected, name);
      assert.equal(typeof body.message, 'string');
      assert(!JSON.stringify(body).includes(secret));
      assert.equal(body.stack, undefined);
    }
    const malformed = await fetch(url + '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"' + secret + '",' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { message: 'Invalid request input' });
    const oversized = await fetch(url + '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(530000) }) });
    assert.equal(oversized.status, 413);
    await oversized.text();
    const charset = await fetch(url + '/login', { method: 'POST', headers: { 'content-type': 'application/json; charset=unsupported' }, body: '{}' });
    assert.equal(charset.status, 415);
    await charset.text();
    const missingApi = await fetch(url + '/api/missing?token=' + secret);
    assert.equal(missingApi.status, 404);
    assert.deepEqual(await missingApi.json(), { message: 'Page not found' });
    const missingPage = await fetch(url + '/missing', { headers: { accept: 'text/html' } });
    assert.equal(missingPage.status, 404);
    assert.equal(await missingPage.text(), 'Page not found');
    await assert.rejects(async () => {
      const partial = await fetch(url + '/api/feed?case=partial');
      await partial.text();
    });
    const healthy = await fetch(url + '/login');
    assert.equal(healthy.status, 200, 'Process remains healthy after failures');
    await healthy.text();
  }
  await new Promise(resolve => server.close(resolve));
  server = null;

  process.env.NODE_ENV = 'development';
  logger.error('Multiline error check', { error: errors.unexpected(), password: secret, request: { body: secret } });
  const latest = JSON.parse(captured.at(-1));
  assert(latest.error.stack.some(line => line.includes(path.basename(__filename))));
  process.env.NODE_ENV = 'production';
  logger.error('Production detail check', { error: errors.unexpected() });
  assert.equal(JSON.parse(captured.at(-1)).error.stack, undefined);
  const append = fs.appendFileSync;
  try {
    fs.appendFileSync = () => { throw Object.assign(new Error(secret), { code: 'EACCES' }); };
    assert.doesNotThrow(() => logger.warn('Filesystem fallback check'));
    assert.equal(JSON.parse(captured.at(-1)).message, 'Could not write log file');
  } finally { fs.appendFileSync = append; }

  const records = fs.readFileSync(logfile).subarray(logOffset).toString();
  assert(!records.includes(secret));
  assert(!captured.join('\n').includes(secret));
  const events = captured.map(line => JSON.parse(line));
  assert.equal(events.filter(event => event.message === 'Request completed with server error').length, 2);
  assert(events.some(event => event.message === 'Request failed' && event.level === 'warn' && event.status === 400));
  assert(events.some(event => event.message === 'Request failed' && event.level === 'error' && event.status === 500));

  const failedConnection = spawnSync(process.execPath, ['app.js'], {
    env: { ...process.env, MONGO_URI: 'invalid-uri-' + secret },
    windowsHide: true, encoding: 'utf8', timeout: 10000
  });
  assert.equal(failedConnection.status, 1);
  assert(failedConnection.stderr.includes('MongoDB connection failed'));
  assert(failedConnection.stderr.includes('Application startup failed'));
  assert(!failedConnection.stderr.includes(secret));

  const occupied = net.createServer();
  occupied.listen(0, '::');
  await once(occupied, 'listening');
  const databaseName = 'daily_web_security_test_' + require('node:crypto').randomBytes(8).toString('hex');
  try {
    const failedListen = spawnSync(process.execPath, ['app.js'], {
      env: { ...process.env, MONGO_URI: 'mongodb://127.0.0.1:27017/' + databaseName, PORT: String(occupied.address().port) },
      windowsHide: true, encoding: 'utf8', timeout: 10000
    });
    assert.equal(failedListen.status, 1);
    assert(failedListen.stderr.includes('EADDRINUSE'));
    assert(failedListen.stderr.includes('Application startup failed'));
    assert(!failedListen.stdout.includes('HTTP server listening'));
    await mongoose.connect('mongodb://127.0.0.1:27017/' + databaseName);
    assert.equal(mongoose.connection.name, databaseName);
    assert(/^daily_web_security_test_[a-f0-9]+$/.test(databaseName));
    await mongoose.connection.dropDatabase();
  } finally {
    await new Promise(resolve => occupied.close(resolve));
    await mongoose.disconnect();
  }
  console.log('PASS: actual app error integration (development + production), async throws, 400/404/409/413/415/422/500/503, partial response, safe logs, disk failure, Mongo startup failure and occupied port');
}

test('central errors, production privacy, disk failures and failed startup', { timeout: 30000 }, async () => {
  try { await main(); }
  finally {
    console.error = originalError;
    console.warn = originalWarn;
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
