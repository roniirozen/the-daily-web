(function () {
  const WEATHER_URL = '/api/weather';
  // Matches the server-side cache lifetime, so the client never polls faster
  // than fresh data could actually appear.
  const REFRESH_MS = 5 * 60 * 1000;
  // Shown weather is hidden once it is older than this.
  const MAX_AGE_MS = 15 * 60 * 1000;
  const RETRY_MS = 60 * 1000;
  let refreshTimer;
  let expiryTimer;
  let loading = false;
  let shownUntil = 0;

  const widget = document.getElementById('weather-widget');
  if (!widget) return;

  const loadingState = document.getElementById('weather-loading');
  const errorState = document.getElementById('weather-error');
  const contentState = document.getElementById('weather-content');
  const locationEl = contentState.querySelector('.weather-location');
  const temperatureEl = contentState.querySelector('.weather-temperature');
  const conditionEl = contentState.querySelector('.weather-condition');
  const updatedEl = contentState.querySelector('.weather-updated');

  function showLoading() {
    loadingState.hidden = false;
    errorState.hidden = true;
    contentState.hidden = true;
  }

  function showError() {
    loadingState.hidden = true;
    errorState.hidden = false;
    contentState.hidden = true;
  }

  function showContent(weather) {
    locationEl.textContent = weather.location;
    temperatureEl.textContent = `${Math.round(weather.temperatureC)}°C`;
    conditionEl.textContent = weather.condition;
    updatedEl.textContent = `Updated ${new Date(weather.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

    loadingState.hidden = true;
    errorState.hidden = true;
    contentState.hidden = false;
  }

  async function loadWeather() {
    if (loading) return;
    loading = true;
    clearTimeout(refreshTimer);
    try {
      const response = await fetch(WEATHER_URL, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Weather request failed with status ${response.status}`);
      }
      const weather = await response.json();
      const fetchedAt = new Date(weather.fetchedAt).getTime();
      const validFor = fetchedAt + MAX_AGE_MS - Date.now();
      if (!Number.isFinite(validFor) || validFor <= 0) throw new Error('Weather expired');
      showContent(weather);
      shownUntil = fetchedAt + MAX_AGE_MS;
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(showError, validFor);
      const nextRefresh = fetchedAt + REFRESH_MS - Date.now();
      refreshTimer = setTimeout(loadWeather, Math.max(nextRefresh, RETRY_MS / 4) + 50);
    } catch (error) {
      // Data already on screen stays until its own expiry timer hides it.
      if (contentState.hidden) showError();
      refreshTimer = setTimeout(loadWeather, RETRY_MS);
    } finally {
      loading = false;
    }
  }

  showLoading();
  loadWeather();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Timers are throttled in background tabs, so check the age directly.
    if (Date.now() >= shownUntil) showLoading();
    loadWeather();
  });
})();
