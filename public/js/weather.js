(function () {
  const WEATHER_URL = '/api/weather';
  // Matches the server-side cache lifetime, so the client never polls faster
  // than fresh data could actually appear.
  const REFRESH_MS = 15 * 60 * 1000;

  const widget = document.getElementById('weather-widget');
  if (!widget) return;

  const loadingState = document.getElementById('weather-loading');
  const errorState = document.getElementById('weather-error');
  const contentState = document.getElementById('weather-content');
  const locationEl = contentState.querySelector('.weather-location');
  const temperatureEl = contentState.querySelector('.weather-temperature');
  const conditionEl = contentState.querySelector('.weather-condition');

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

    loadingState.hidden = true;
    errorState.hidden = true;
    contentState.hidden = false;
  }

  async function loadWeather() {
    try {
      const response = await fetch(WEATHER_URL, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Weather request failed with status ${response.status}`);
      }
      const weather = await response.json();
      showContent(weather);
    } catch (error) {
      showError();
    }
  }

  showLoading();
  loadWeather();
  setInterval(loadWeather, REFRESH_MS);
})();
