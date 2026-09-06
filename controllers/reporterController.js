const Article = require('../models/Article');

function getReporterId(req) {
  return req.session?.user?.id || null;
}

exports.getDashboard = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);

    if (!reporterId) {
      return res.status(401).send('Authentication required');
    }

    const articles = await Article.find({
      reporter: reporterId
    }).sort({ updatedAt: -1 });

    res.render('reporter/dashboard', {
      pageTitle: 'Reporter Dashboard',
      articles
    });
  } catch (error) {
    next(error);
  }
};

exports.getNewArticle = (req, res) => {
  res.render('reporter/edit-article', {
    pageTitle: 'New Article',
    article: null
  });
};

exports.createArticle = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);

    if (!reporterId) {
      return res.status(401).json({
        message: 'Authentication required'
      });
    }

    const article = await Article.create({
      reporter: reporterId,

      workingVersion: {
        title: req.body.title || '',
        summary: req.body.summary || '',
        content: req.body.content || '',
        imageUrl: req.body.imageUrl || '',
        category: req.body.category || ''
      },

      status: 'draft',
      lastAutosavedAt: new Date()
    });

    res.status(201).json({
      message: 'Draft created successfully',
      articleId: article._id
    });
  } catch (error) {
    next(error);
  }
};

exports.getEditArticle = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);

    if (!reporterId) {
      return res.status(401).send('Authentication required');
    }

    const article = await Article.findOne({
      _id: req.params.id,
      reporter: reporterId
    });

    if (!article) {
      return res.status(404).send('Article not found');
    }

    res.render('reporter/edit-article', {
      pageTitle: 'Edit Article',
      article
    });
  } catch (error) {
    next(error);
  }
};

exports.autosaveArticle = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);

    if (!reporterId) {
      return res.status(401).json({
        message: 'Authentication required'
      });
    }

    const article = await Article.findOne({
      _id: req.params.id,
      reporter: reporterId
    });

    if (!article) {
      return res.status(404).json({
        message: 'Article not found'
      });
    }

    if (article.status === 'pending') {
      return res.status(409).json({
        message: 'An article waiting for editor approval cannot be edited'
      });
    }

    article.workingVersion.title = req.body.title ?? '';
    article.workingVersion.summary = req.body.summary ?? '';
    article.workingVersion.content = req.body.content ?? '';
    article.workingVersion.imageUrl = req.body.imageUrl ?? '';
    article.workingVersion.category = req.body.category ?? '';

    /*
      Editing a previously published article starts a new working draft.
      publishedVersion remains unchanged, so readers still see
      the last editor-approved version.
    */
    if (article.status === 'published') {
      article.status = 'draft';
    }

    article.lastAutosavedAt = new Date();

    await article.save();

    res.json({
      message: 'Draft saved',
      savedAt: article.lastAutosavedAt
    });
  } catch (error) {
    next(error);
  }
};

exports.submitForReview = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);

    if (!reporterId) {
      return res.status(401).json({
        message: 'Authentication required'
      });
    }

    const article = await Article.findOne({
      _id: req.params.id,
      reporter: reporterId
    });

    if (!article) {
      return res.status(404).json({
        message: 'Article not found'
      });
    }

    if (!['draft', 'returned'].includes(article.status)) {
      return res.status(409).json({
        message: 'This article cannot be submitted in its current status'
      });
    }

    const version = article.workingVersion;

    if (
      !version.title.trim() ||
      !version.summary.trim() ||
      !version.content.trim() ||
      !version.category.trim()
    ) {
      return res.status(400).json({
        message: 'Title, summary, content and category are required'
      });
    }

    article.status = 'pending';
    article.editorNote = '';

    await article.save();

    res.json({
      message: 'Article submitted for editor approval'
    });
  } catch (error) {
    next(error);
  }
};
