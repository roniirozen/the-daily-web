const Article = require('../models/Article');
const Comment = require('../models/Comment');

exports.getArticle = async (req, res, next) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
      return res.status(400).send('Invalid article ID');
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
      return res.status(404).send('Article not found');
    }

    const comments = await Comment.find({ article: article._id })
      .select('authorName content createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    res.render('public/article', { article, comments });
  } catch (error) {
    next(error);
  }
};
