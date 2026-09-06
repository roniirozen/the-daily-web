const mongoose = require('mongoose');
const viewStatsService = require('../services/viewStatsService');

/*
  Records one view per public article page request into the existing hourly
  ViewStat buckets (see services/viewStatsService.js) instead of a raw
  per-request event collection. Recording happens after the response is sent
  and never blocks or fails the page render - a dropped view never turns
  into a broken article page.

  Kept separate from controllers/publicController.js (owned in parallel by
  the comments/article-page work) so it can be wired in with a single line
  once merged: see the integration note in the PR description.
*/
function trackArticleView(req, res, next) {
  const articleId = req.params.id;

  res.on('finish', () => {
    if (res.statusCode !== 200) return;
    if (!mongoose.isObjectIdOrHexString(articleId)) return;

    viewStatsService.recordView(articleId).catch(error => {
      console.error('Failed to record article view:', error.message);
    });
  });

  next();
}

module.exports = { trackArticleView };
