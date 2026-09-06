(() => {
  const STORAGE_KEY = 'dailyWebViewedArticles';
  const articleElement = document.querySelector(
    '.article-detail[data-article-id]'
  );

  if (!articleElement) return;

  const articleId = articleElement.dataset.articleId;
  if (!/^[a-f0-9]{24}$/i.test(articleId)) return;

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    let parsedValue = [];

    if (storedValue) {
      try {
        parsedValue = JSON.parse(storedValue);
      } catch (error) {
        parsedValue = [];
      }
    }

    const priorIds = Array.isArray(parsedValue)
      ? parsedValue.filter(value => typeof value === 'string')
      : [];
    const viewedArticleIds = [...new Set(priorIds)];

    if (!viewedArticleIds.includes(articleId)) {
      viewedArticleIds.push(articleId);
    }

    // Writing the normalized array also removes any pre-existing duplicates.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(viewedArticleIds)
    );
  } catch (error) {
    // Storage may be disabled or full. Article rendering and comments must
    // keep working in either case.
  }
})();
