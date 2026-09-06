(function () {
  const FEED_URL = '/api/feed';
  const VIEWED_STORAGE_KEY = 'dailyWebViewedArticles';
  const SEARCH_DEBOUNCE_MS = 350;

  const container = document.getElementById('articles-container');
  if (!container) return;

  const emptyMessage = document.getElementById('feed-empty');
  const errorMessage = document.getElementById('feed-error');
  const loadingIndicator = document.getElementById('feed-loading');
  const sentinel = document.getElementById('feed-sentinel');

  const searchInput = document.getElementById('feed-search');
  const categorySelect = document.getElementById('feed-category');
  const viewedSelect = document.getElementById('feed-viewed');
  const sortSelect = document.getElementById('feed-sort');

  let nextCursor = null;
  let hasMore = true;
  let isLoading = false;
  let requestToken = 0;
  let activeRequest = null;
  let activeQuery = '';
  const renderedIds = new Set();
  const knownCategories = new Set();

  // Contract with Student 3: viewed article IDs are recorded client-side
  // under this exact localStorage key as they read articles.
  function readViewedIds() {
    try {
      const raw = window.localStorage.getItem(VIEWED_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? [...new Set(parsed.filter(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)))] : [];
    } catch {
      return [];
    }
  }

  function buildQuery(cursor) {
    const params = new URLSearchParams();

    const q = searchInput.value.trim();
    if (q) params.set('q', q);

    const category = categorySelect.value;
    if (category) params.set('category', category);

    const viewed = viewedSelect.value;
    if (viewed && viewed !== 'all') {
      params.set('viewed', viewed);
      const viewedIds = readViewedIds();
      if (viewedIds.length) params.set('viewedIds', viewedIds.join(','));
    }

    const sort = sortSelect.value;
    if (sort) params.set('sort', sort);

    if (cursor) params.set('cursor', cursor);

    return params.toString();
  }

  function formatDate(value) {
    if (!value) return 'Publication date unavailable';
    return new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function updateCategoryOptions(articles) {
    let changed = false;
    articles.forEach(article => {
      if (renderedIds.has(article.id)) return;
      renderedIds.add(article.id);
      if (article.category && !knownCategories.has(article.category)) {
        knownCategories.add(article.category);
        changed = true;
      }
    });
    if (!changed) return;

    const currentValue = categorySelect.value;
    const sorted = Array.from(knownCategories).sort((a, b) => a.localeCompare(b));
    const options = ['<option value="">All categories</option>'];
    sorted.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      options.push(option.outerHTML);
    });
    categorySelect.innerHTML = options.join('');
    categorySelect.value = currentValue;
  }

  function renderArticles(articles) {
    const fragment = document.createDocumentFragment();

    articles.forEach(article => {
      const card = document.createElement('article');
      card.className = 'article-card';
      card.dataset.articleId = article.id;

      const imageWrapper = document.createElement('div');
      if (article.image) {
        imageWrapper.className = 'article-image';
        const img = document.createElement('img');
        img.src = article.image;
        img.alt = article.title || '';
        img.loading = 'lazy';
        imageWrapper.appendChild(img);
      } else {
        imageWrapper.className = 'article-image placeholder-image';
        imageWrapper.textContent = 'Article image';
      }

      const content = document.createElement('div');
      content.className = 'article-content';

      const meta = document.createElement('div');
      meta.className = 'article-meta';
      if (article.category) {
        const categorySpan = document.createElement('span');
        categorySpan.textContent = article.category;
        meta.appendChild(categorySpan);
      }
      const dateSpan = document.createElement('span');
      dateSpan.textContent = formatDate(article.publishedAt);
      meta.appendChild(dateSpan);

      const heading = document.createElement('h3');
      const link = document.createElement('a');
      link.href = `/articles/${article.id}`;
      link.textContent = article.title || 'Untitled article';
      heading.appendChild(link);

      const summary = document.createElement('p');
      summary.textContent = article.summary || '';

      const author = document.createElement('div');
      author.className = 'article-author';
      author.textContent = `By ${article.reporter || 'Unknown reporter'}`;

      content.append(meta, heading, summary, author);
      card.append(imageWrapper, content);
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  function resetFeed() {
    requestToken += 1;
    if (activeRequest) activeRequest.abort();
    isLoading = false;
    renderedIds.clear();
    activeQuery = buildQuery(null);
    nextCursor = null;
    hasMore = true;
    container.innerHTML = '';
    emptyMessage.hidden = true;
    errorMessage.hidden = true;
  }

  async function loadMore() {
    if (isLoading || !hasMore) return;
    isLoading = true;
    loadingIndicator.hidden = false;
    errorMessage.hidden = true;

    const thisToken = ++requestToken;
    activeRequest = new AbortController();
    let loaded = false;

    try {
      const params = new URLSearchParams(activeQuery);
      if (nextCursor) params.set('cursor', nextCursor);
      const query = params.toString();
      // A long viewed history belongs in a parsed body, not an oversized URL.
      const longQuery = query.length > 6000;
      const response = await fetch(longQuery ? FEED_URL : `${FEED_URL}?${query}`, {
        method: longQuery ? 'POST' : 'GET',
        headers: { Accept: 'application/json', ...(longQuery ? { 'Content-Type': 'application/json' } : {}) },
        ...(longQuery ? { body: JSON.stringify(Object.fromEntries(params)) } : {}),
        signal: activeRequest.signal
      });

      if (!response.ok) {
        throw new Error(`Feed request failed with status ${response.status}`);
      }

      const data = await response.json();

      // A newer query started while this one was in flight; discard the result.
      if (thisToken !== requestToken) return;

      updateCategoryOptions(data.articles || []);
      renderArticles(data.articles || []);

      nextCursor = data.nextCursor || null;
      hasMore = Boolean(data.hasMore);
      loaded = true;

      if (!container.children.length) {
        emptyMessage.hidden = false;
      }
    } catch (error) {
      if (thisToken !== requestToken) return;
      errorMessage.hidden = false;
    } finally {
      if (thisToken === requestToken) {
        isLoading = false;
        loadingIndicator.hidden = true;
        if (loaded && hasMore && sentinel.getBoundingClientRect().top < window.innerHeight + 400) {
          requestAnimationFrame(loadMore);
        }
      }
    }
  }

  function restartFeed() {
    resetFeed();
    loadMore();
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(restartFeed, SEARCH_DEBOUNCE_MS);
  });

  [categorySelect, viewedSelect, sortSelect].forEach(control => {
    control.addEventListener('change', restartFeed);
  });
  document.getElementById('feed-retry').addEventListener('click', loadMore);
  window.addEventListener('storage', event => {
    if (event.key === VIEWED_STORAGE_KEY && viewedSelect.value !== 'all') restartFeed();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) restartFeed(); });

  const feedForm = document.getElementById('feed-controls');
  if (feedForm) {
    feedForm.addEventListener('submit', event => event.preventDefault());
  }

  if ('IntersectionObserver' in window && sentinel) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        loadMore();
      }
    }, { rootMargin: '400px' });
    observer.observe(sentinel);
  } else {
    // Fallback for browsers without IntersectionObserver support.
    window.addEventListener('scroll', () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
      if (nearBottom) loadMore();
    });
  }

  fetch(`${FEED_URL}/categories`, { headers: { Accept: 'application/json' } })
    .then(response => { if (!response.ok) throw new Error('Categories unavailable'); return response.json(); })
    .then(data => updateCategoryOptions(data.categories.map(category => ({ category }))))
    .catch(() => { /* Categories from successfully loaded stories remain available. */ });
  restartFeed();
})();
