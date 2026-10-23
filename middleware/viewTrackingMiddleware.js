const mongoose = require('mongoose');
const viewStatsService = require('../services/viewStatsService');
const logger = require('../utils/logger');

// Counts one view per article page, after the response is sent.
// A failure here never breaks the page.
function trackArticleView(req, res, next) {
  const articleId = req.params.id;

  res.on('finish', () => {
    if (res.statusCode !== 200) return;
    if (!mongoose.isObjectIdOrHexString(articleId)) return;

    viewStatsService.recordView(articleId).catch(error => {
      logger.error('Failed to record article view', { error, route: '/articles/:id' });
    });
  });

  next();
}

module.exports = { trackArticleView };
