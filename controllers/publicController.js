const Article = require('../models/Article');
const { getCommentPage } = require('../services/commentQueries');
const { respond } = require('../middleware/errorMiddleware');

exports.getArticle = async (req, res, next) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
      return respond(req, res, 400, 'Invalid article ID');
    }

    // Workflow status may be draft/pending/returned while an approved version
    // remains public. Never expose workingVersion through this endpoint.
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
    res.render('public/article', { article, comments, nextCommentsCursor: nextCursor });
  } catch (error) {
    next(error);
  }
};
