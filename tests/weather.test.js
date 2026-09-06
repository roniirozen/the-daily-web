const test = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../services/weatherService');

test('weather shares concurrent requests, caches for 15 minutes, and refuses expired data during outages', async t => {
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
  global.fetch = async () => { calls += 1; throw new Error('Simulated outage'); };
  await assert.rejects(weather.getWeather(), /Simulated outage/);
  assert.equal(calls, 2);
});
