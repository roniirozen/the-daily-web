const mongoose = require('mongoose');
const viewStatsService = require('../services/viewStatsService');
const logger = require('../utils/logger');

/*
  Records one view per public article page request into the existing hourly
  ViewStat buckets (see services/viewStatsService.js) instead of a raw
  per-request event collection. Recording happens after the response is sent
  and never blocks or fails the page render - a dropped view never turns
  into a broken article page.

  Mounted on the public article route before the rendering controller.
*/
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
