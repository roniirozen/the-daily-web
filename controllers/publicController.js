const Article = require('../models/Article');
const { getCommentPage } = require('../services/commentQueries');
const { respond } = require('../middleware/errorMiddleware');

exports.getHome = (req, res) => {
  // The feed itself is loaded by public/js/feed.js through /api/feed.
  res.render('public/home', { pageTitle: 'The Daily Web' });
};

exports.getArticle = async (req, res, next) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
      return respond(req, res, 400, 'Invalid article ID');
    }

    // A new version may be in progress; show only the published one.
    const article = await Article.findOne({
      _id: req.params.id,
      publishedVersion: { $exists: true, $ne: null }
    })
      .select('publishedVersion reporter publishedAt')
      .populate('reporter', 'username')
      .lean();

    if (!article) {
      return respond(req, res, 404, 'Article not found');
    }

    const { comments, nextCursor } = await getCommentPage(article._id);
    res.render('public/article', {
      article,
      comments,
      nextCommentsCursor: nextCursor,
      // Only shows the controls. The comment API checks the Editor role itself.
      canModerate: req.currentUser?.role === 'editor'
    });
  } catch (error) {
    next(error);
  }
};
