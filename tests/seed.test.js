const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const User = require('../models/User');

test('seed requires opt-in and a demo database; reseeding and final verification work', { timeout: 60000 }, async t => {
  const name = 'daily_web_test_' + randomBytes(8).toString('hex');
  const uri = 'mongodb://127.0.0.1:27017/' + name;
  const cwd = path.join(__dirname, '..');
  function run(script, env) {
    return spawnSync(process.execPath, [script], { cwd, env: { ...process.env, MONGO_URI: uri, ...env }, windowsHide: true, encoding: 'utf8', timeout: 25000 });
  }
  t.after(async () => {
    if (mongoose.connection.name === name && /^daily_web_test_[a-f0-9]+$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  assert.equal(run('scripts/seedDemoData.js', { DEMO_SEED: 'false' }).status, 1);
  assert.equal(run('scripts/seedDemoData.js', { DEMO_SEED: 'true', MONGO_URI: 'mongodb://127.0.0.1:27017/ordinary_database' }).status, 1);
  await mongoose.connect(uri);
  const sentinel = await User.create({ username: 'preserved_user', role: 'reporter', passwordSalt: '0'.repeat(32), passwordHash: '0'.repeat(128) });
  for (let runNumber = 0; runNumber < 2; runNumber++) {
    const seeded = run('scripts/seedDemoData.js', { DEMO_SEED: 'true' });
    assert.equal(seeded.status, 0, seeded.stderr);
    assert(!seeded.stdout.includes('DemoReporter!2026'));
    assert(await User.exists({ _id: sentinel._id }));
    assert.equal(await Article.countDocuments(), 540);
    const verified = run('scripts/verifyDemoData.js', {});
    assert.equal(verified.status, 0, verified.stdout + verified.stderr);
    assert(verified.stdout.includes('DEMO DATA VERIFICATION: PASSED'));
  }
});
