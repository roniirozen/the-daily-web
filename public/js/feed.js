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
  const knownCategories = new Set();

  // Contract with Student 3: viewed article IDs are recorded client-side
  // under this exact localStorage key as they read articles.
  function readViewedIds() {
    try {
      const raw = window.localStorage.getItem(VIEWED_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
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

    try {
      const query = buildQuery(nextCursor);
      const response = await fetch(`${FEED_URL}?${query}`, {
        headers: { Accept: 'application/json' }
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

      if (!container.children.length) {
        emptyMessage.hidden = false;
      }
    } catch (error) {
      if (thisToken !== requestToken) return;
      hasMore = false;
      if (!container.children.length) {
        errorMessage.hidden = false;
      }
    } finally {
      if (thisToken === requestToken) {
        isLoading = false;
        loadingIndicator.hidden = true;
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

  loadMore();
})();
