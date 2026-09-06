(function () {
  const FEED_URL = '/api/feed';

  const container = document.getElementById('articles-container');
  if (!container) return;

  const emptyMessage = document.getElementById('feed-empty');
  const errorMessage = document.getElementById('feed-error');
  const loadingIndicator = document.getElementById('feed-loading');
  const sentinel = document.getElementById('feed-sentinel');

  let nextCursor = null;
  let hasMore = true;
  let isLoading = false;

  function formatDate(value) {
    if (!value) return 'Publication date unavailable';
    return new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
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

  async function loadMore() {
    if (isLoading || !hasMore) return;
    isLoading = true;
    loadingIndicator.hidden = false;
    errorMessage.hidden = true;

    try {
      const params = new URLSearchParams();
      if (nextCursor) params.set('cursor', nextCursor);

      const response = await fetch(`${FEED_URL}?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Feed request failed with status ${response.status}`);
      }

      const data = await response.json();
      renderArticles(data.articles || []);

      nextCursor = data.nextCursor || null;
      hasMore = Boolean(data.hasMore);

      if (!container.children.length) {
        emptyMessage.hidden = false;
      }
    } catch (error) {
      hasMore = false;
      if (!container.children.length) {
        errorMessage.hidden = false;
      }
    } finally {
      isLoading = false;
      loadingIndicator.hidden = true;
    }
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
