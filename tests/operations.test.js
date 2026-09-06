const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const { hashPassword } = require('../utils/password');
const { hashSessionToken } = require('../utils/sessionToken');

test('database sessions survive process restart; cookies, expiry, logout and logs are safe', { timeout: 30000 }, async t => {
  const dbName = 'daily_web_test_' + randomBytes(8).toString('hex');
  const uri = 'mongodb://127.0.0.1:27017/' + dbName;
  let server;
  let base;
  let output = '';
  async function stop() {
    if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
    server = null;
  }
  t.after(async () => {
    await stop();
    if (mongoose.connection.name === dbName && /^daily_web_test_[a-f0-9]+$/.test(dbName)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  async function start() {
    let lines = '';
    server = spawn(process.execPath, ['app.js'], { cwd: path.join(__dirname, '..'),
      env: { ...process.env, MONGO_URI: uri, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => { lines += data; output += data; });
    server.stderr.on('data', data => { output += data; });
    for (let i = 0; i < 100; i++) {
      const line = lines.split('\n').find(line => line.includes('HTTP server listening'));
      if (line) { base = 'http://127.0.0.1:' + JSON.parse(line).port; return; }
      if (server.exitCode !== null) throw new Error('Server startup failed');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Server startup timed out');
  }
  await mongoose.connect(uri);
  const password = 'private-' + randomBytes(16).toString('hex');
  const { hash, salt } = await hashPassword(password);
  const user = await User.create({ username: 'restart_reporter', role: 'reporter', passwordHash: hash, passwordSalt: salt });
  await start();
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user.username, password }) });
  assert.equal(login.status, 302);
  const setCookie = login.headers.get('set-cookie');
  assert(setCookie.includes('HttpOnly')); assert(setCookie.includes('SameSite=Lax'));
  const cookie = setCookie.split(';')[0];
  const token = cookie.split('=')[1];
  const session = await Session.findOne({ tokenHash: hashSessionToken(token) }).lean();
  assert(session); assert(!JSON.stringify(session).includes(token));
  await stop(); await start();
  const authenticated = await fetch(base + '/reporter', { headers: { cookie }, redirect: 'manual' });
  assert.equal(authenticated.status, 200); await authenticated.text();
  await User.updateOne({ _id: user._id }, { $set: { role: 'editor' } });
  const currentRole = await fetch(base + '/editor', { headers: { cookie }, redirect: 'manual' });
  assert.equal(currentRole.status, 200); await currentRole.text();
  for (const malformed of ['session_token=%E0%A4%A', 'session_token=', 'broken-cookie', 'session_token=fake']) {
    const response = await fetch(base + '/editor', { headers: { cookie: malformed } });
    assert.equal(response.status, 401); await response.text();
  }
  await Session.updateOne({ _id: session._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await fetch(base + '/editor', { headers: { cookie } });
  assert.equal(expired.status, 401); await expired.text();
  const logout = await fetch(base + '/logout', { method: 'POST', redirect: 'manual', headers: { cookie } });
  assert.equal(logout.status, 302);
  assert.equal(await Session.countDocuments({ _id: session._id }), 0);
  await stop();
  for (const secret of [password, hash, salt, token]) assert(!output.includes(secret), 'Credentials must not reach process logs');
  assert(output.includes('Login succeeded')); assert(output.includes('Logout completed'));
});

test('logger excludes multiline secrets, persists records and tolerates disk failures', () => {
  const logger = require('../utils/logger');
  const secret = 'secret-' + randomBytes(16).toString('hex');
  const failure = new Error('Sensitive value\n    at ' + secret);
  const captured = [];
  const originalError = console.error;
  const originalAppend = fs.appendFileSync;
  const mode = process.env.NODE_ENV;
  try {
    console.error = line => captured.push(line);
    process.env.NODE_ENV = 'development';
    logger.error('Release logging check', { error: failure, password: secret, token: secret });
    assert(JSON.parse(captured.at(-1)).error.stack.length > 0);
    process.env.NODE_ENV = 'production';
    logger.error('Production logging check', { error: failure });
    assert.equal(JSON.parse(captured.at(-1)).error.stack, undefined);
    fs.appendFileSync = () => { throw new Error(secret); };
    assert.doesNotThrow(() => logger.error('Disk fallback check'));
    assert(captured.at(-1).includes('Could not write log file'));
    assert(!captured.join('').includes(secret));
    const log = fs.readFileSync(path.join(__dirname, '..', 'logs', new Date().toISOString().slice(0, 10) + '.log'), 'utf8');
    assert(log.includes('Release logging check')); assert(!log.includes(secret));
  } finally {
    console.error = originalError; fs.appendFileSync = originalAppend;
    if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
  }
  const failed = spawnSync(process.execPath, ['app.js'], { cwd: path.join(__dirname, '..'),
    env: { ...process.env, MONGO_URI: 'invalid-uri-' + secret }, windowsHide: true, encoding: 'utf8', timeout: 10000 });
  assert.equal(failed.status, 1);
  assert(failed.stderr.includes('MongoDB connection failed')); assert(!failed.stderr.includes(secret));
});
