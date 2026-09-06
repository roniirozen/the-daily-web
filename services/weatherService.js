const CACHE_MAX_AGE_MS = 15 * 60 * 1000; // Displayed data must never be older than 15 minutes.

// Non-secret location defaults (Tel Aviv). Override via environment
// variables if the project needs a different city - no API key required.
const LATITUDE = Number(process.env.WEATHER_LATITUDE) || 32.0853;
const LONGITUDE = Number(process.env.WEATHER_LONGITUDE) || 34.7818;
const LOCATION_NAME = process.env.WEATHER_LOCATION_NAME || 'Tel Aviv';

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
};

// Module-level cache shared by every request in this process. One external
// fetch serves every concurrent user until it goes stale, instead of one
// external call per page view.
let cache = null; // { fetchedAt: number, data: object }
let inFlightRequest = null;

function describeCode(code) {
  return WEATHER_CODES[code] || 'Unknown conditions';
}

function isFresh(entry) {
  return Boolean(entry) && (Date.now() - entry.fetchedAt) < CACHE_MAX_AGE_MS;
}

async function fetchFromOpenMeteo() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(LATITUDE));
  url.searchParams.set('longitude', String(LONGITUDE));
  url.searchParams.set('current_weather', 'true');

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const current = payload.current_weather;
  if (!current) {
    throw new Error('Open-Meteo response missing current_weather');
  }

  return {
    location: LOCATION_NAME,
    temperatureC: current.temperature,
    windSpeedKmh: current.windspeed,
    condition: describeCode(current.weathercode),
    observedAt: current.time,
    fetchedAt: new Date().toISOString()
  };
}

/*
  Returns cached weather when it is under 15 minutes old. Otherwise fetches
  fresh data. Concurrent callers during a refresh share the same in-flight
  request instead of each triggering their own call to Open-Meteo.
*/
async function getWeather() {
  if (isFresh(cache)) {
    return cache.data;
  }

  if (!inFlightRequest) {
    inFlightRequest = fetchFromOpenMeteo()
      .then(data => {
        cache = { fetchedAt: Date.now(), data };
        return data;
      })
      .finally(() => {
        inFlightRequest = null;
      });
  }

  try {
    return await inFlightRequest;
  } catch (error) {
    // Serve stale cache rather than nothing if the external API failed and
    // we still have older-than-fresh data. Otherwise propagate the error.
    if (cache) {
      return cache.data;
    }
    throw error;
  }
}

function clearCache() {
  cache = null;
  inFlightRequest = null;
}

module.exports = {
  getWeather,
  clearCache,
  CACHE_MAX_AGE_MS
};
