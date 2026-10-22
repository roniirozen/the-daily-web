// Search, filters and paging on newsroom lists without reloading the page.
// For these requests the server returns only the results partial.
(function () {
  const SEARCH_DEBOUNCE_MS = 350;

  const results = document.querySelector('[data-results]');
  if (!results) return;
  const form = document.querySelector('[data-results-form]');
  const status = document.querySelector('[data-results-status]');

  let activeRequest = null;
  let debounceTimer = null;

  function announce(message) {
    if (status) status.textContent = message;
  }

  // Keep the controls in step with the URL, also after Back and Forward.
  function syncForm(url) {
    if (!form) return;
    const params = new URL(url, location.href).searchParams;
    for (const field of form.elements) {
      if (field.name) field.value = params.get(field.name) ?? '';
    }
  }

  async function load(url, { updateHistory = true } = {}) {
    if (activeRequest) activeRequest.abort();
    const request = new AbortController();
    activeRequest = request;
    results.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html' },
        signal: request.signal
      });
      // A signed-out user is redirected to the login page by the server.
      if (response.redirected) {
        location.assign(response.url);
        return;
      }
      if (!response.ok) throw new Error('List request failed with status ' + response.status);

      results.innerHTML = await response.text();
      if (updateHistory) history.pushState(null, '', url);
      syncForm(url);
      const summary = results.querySelector('[data-results-summary]');
      announce(summary ? summary.textContent : '');
    } catch (error) {
      if (error.name === 'AbortError') return;
      announce('The list could not be updated. Check the search and try again.');
    } finally {
      if (activeRequest === request) {
        activeRequest = null;
        results.removeAttribute('aria-busy');
      }
    }
  }

  function urlFromForm() {
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === 'string' && value.trim()) params.set(name, value.trim());
    }
    const query = params.toString();
    return form.getAttribute('action') + (query ? '?' + query : '');
  }

  if (form) {
    form.addEventListener('submit', event => {
      event.preventDefault();
      clearTimeout(debounceTimer);
      load(urlFromForm());
    });
    form.addEventListener('change', event => {
      if (event.target.tagName === 'SELECT') load(urlFromForm());
    });
    form.addEventListener('input', event => {
      if (event.target.type !== 'search') return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => load(urlFromForm()), SEARCH_DEBOUNCE_MS);
    });
  }

  // Paging links and "show all" links inside or next to the list.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-results-link]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    load(link.href).then(() => {
      if (link.closest('.pagination')) results.scrollIntoView({ block: 'start' });
    });
  });

  window.addEventListener('popstate', () => load(location.href, { updateHistory: false }));
})();
