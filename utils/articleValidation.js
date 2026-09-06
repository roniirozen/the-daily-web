const ARTICLE_LIMITS = {
  title: 200,
  summary: 1000,
  content: 50000,
  imageUrl: 2048,
  category: 80
};

function validateArticleInput(body, requireComplete = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Article input must be an object' };
  }

  const fields = {};
  for (const [name, limit] of Object.entries(ARTICLE_LIMITS)) {
    // An omitted field in a partial autosave must not erase saved content.
    if (!Object.prototype.hasOwnProperty.call(body, name)) continue;
    if (typeof body[name] !== 'string') {
      return { error: name + ' must be a string' };
    }
    if (body[name].length > limit) {
      return { error: name + ' must be at most ' + limit + ' characters' };
    }
    fields[name] = name === 'content' ? body[name] : body[name].trim();
  }

  if (fields.imageUrl) {
    try {
      const url = new URL(fields.imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { error: 'Image URL must use HTTP or HTTPS' };
      }
    } catch {
      return { error: 'Image URL must be a valid HTTP or HTTPS URL' };
    }
  }

  if (requireComplete) {
    for (const name of ['title', 'summary', 'content', 'category']) {
      if (!fields[name] || !fields[name].trim()) {
        return { error: 'Title, summary, content and category are required' };
      }
    }
  }
  return { fields };
}

module.exports = { ARTICLE_LIMITS, validateArticleInput };
