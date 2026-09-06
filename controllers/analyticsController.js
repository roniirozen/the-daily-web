const mongoose = require('mongoose');
const Article = require('../models/Article');
const viewStatsService = require('../services/viewStatsService');

function articleTitle(article) {
  return article.publishedVersion?.title || article.workingVersion?.title || 'Untitled article';
}

async function findArticleForAnalytics(id) {
  if (!mongoose.isObjectIdOrHexString(id)) {
    return { error: 400, message: 'Invalid article id.' };
  }

  const article = await Article.findById(id)
    .select('workingVersion.title publishedVersion.title status publishedAt publicationHistory reporter')
    .populate('reporter', 'username')
    .populate('publicationHistory.editor', 'username')
    .lean();

  if (!article) {
    return { error: 404, message: 'Article not found.' };
  }

  return { article };
}

exports.getAnalyticsPage = async (req, res, next) => {
  try {
    const { article, error, message } = await findArticleForAnalytics(req.params.id);
    if (error) return res.status(error).send(message);

    return res.render('editor/analytics', {
      pageTitle: 'Article Analytics',
      article,
      articleTitle: articleTitle(article)
    });
  } catch (err) {
    return next(err);
  }
};

exports.getAnalyticsData = async (req, res, next) => {
  try {
    const { article, error, message } = await findArticleForAnalytics(req.params.id);
    if (error) return res.status(error).json({ message });

    const [timeline, totalViews] = await Promise.all([
      viewStatsService.getTimeline(req.params.id),
      viewStatsService.getTotalViews(req.params.id)
    ]);

    return res.json({
      article: {
        id: article._id,
        title: articleTitle(article),
        status: article.status,
        publishedAt: article.publishedAt
      },
      totalViews,
      timeline: timeline.map(bucket => ({
        bucketStart: bucket.bucketStart,
        viewCount: bucket.viewCount
      })),
      publicationHistory: (article.publicationHistory || []).map(entry => ({
        approvedAt: entry.approvedAt,
        type: entry.type,
        editor: entry.editor?.username || 'Unknown editor'
      }))
    });
  } catch (err) {
    return next(err);
  }
};
