const test = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../services/weatherService');

test('weather shares concurrent requests, refreshes every 5 minutes, and never returns data older than 15 minutes', async t => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  let calls = 0;
  Date.now = () => now;
  global.fetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { ok: true, json: async () => ({ current_weather: { temperature: 25, windspeed: 8, weathercode: 0, time: new Date().toISOString() } }) };
  };
  t.after(() => { global.fetch = originalFetch; Date.now = originalNow; weather.clearCache(); });
  weather.clearCache();
  const results = await Promise.all(Array.from({ length: 100 }, () => weather.getWeather()));
  assert.equal(calls, 1);
  assert(results.every(result => result.temperatureC === 25));
  now += weather.CACHE_MAX_AGE_MS - 1;
  await weather.getWeather();
  assert.equal(calls, 1);
  now += 2;
  await weather.getWeather();
  assert.equal(calls, 2, 'refreshes once the 5-minute cache expires');

  global.fetch = async () => { calls += 1; throw new Error('Simulated outage'); };
  now += weather.CACHE_MAX_AGE_MS + 1;
  assert.equal((await weather.getWeather()).temperatureC, 25, 'recent data survives an outage');
  assert.equal(calls, 3);
  await weather.getWeather();
  assert.equal(calls, 3, 'waits before retrying a failed service');
  now += weather.STALE_LIMIT_MS;
  await assert.rejects(weather.getWeather(), /Simulated outage/);
  assert.equal(calls, 4, 'data older than 15 minutes is never returned');
});
