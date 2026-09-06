const Article = require('../models/Article');
const { validateArticleInput } = require('../utils/articleValidation');

function getReporterId(req) {
  return req.session?.user?.id || null;
}

exports.getDashboard = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);

    if (!reporterId) {
      return res.status(401).send('Authentication required');
    }

    const pageSize = 20;
    const requestedPage = req.query.page === undefined ? 1 : Number(req.query.page);
    if (
      (req.query.page !== undefined &&
        (typeof req.query.page !== 'string' || !/^[1-9]\d*$/.test(req.query.page))) ||
      !Number.isSafeInteger(requestedPage) || requestedPage < 1
    ) {
      return res.status(400).send('Invalid page number');
    }

    const filter = { reporter: reporterId };
    const total = await Article.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const articles = await Article.find(filter)
      // The title is enough to indicate an approved snapshot exists.
      .select('workingVersion.title status updatedAt editorNote publishedVersion.title')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    res.render('reporter/dashboard', {
      pageTitle: 'Reporter Dashboard',
      articles,
      page,
      totalPages,
      total
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

    const input = validateArticleInput(req.body);
    if (input.error) {
      return res.status(400).json({ message: input.error });
    }
    const article = await Article.create({
      reporter: reporterId,
      workingVersion: input.fields,

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
      return res.status(401).json({ message: 'Authentication required' });
    }

    const article = await Article.findOne({
      _id: req.params.id,
      reporter: reporterId
    });
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    if (!['draft', 'returned', 'published'].includes(article.status)) {
      return res.status(409).json({
        message: 'An article waiting for editor approval cannot be edited'
      });
    }

    const input = validateArticleInput(req.body);
    if (input.error) {
      return res.status(400).json({ message: input.error });
    }
    const versionChanges = {};
    for (const [name, value] of Object.entries(input.fields)) {
      versionChanges['workingVersion.' + name] = value;
    }

    // Check the revision and status again in MongoDB, not just in this request.
    // Neither operation writes to publishedVersion.
    const updated = await Article.findOneAndUpdate(
      {
        _id: article._id,
        reporter: reporterId,
        status: article.status,
        __v: article.__v
      },
      {
        $set: {
          ...versionChanges,
          status: article.status === 'published' ? 'draft' : article.status,
          lastAutosavedAt: new Date()
        },
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({
        message: 'Article changed while saving. Reload before continuing.'
      });
    }
    res.json({
      message: 'Draft saved',
      status: updated.status,
      savedAt: updated.lastAutosavedAt
    });
  } catch (error) {
    next(error);
  }
};

exports.submitForReview = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);
    if (!reporterId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const article = await Article.findOne({
      _id: req.params.id,
      reporter: reporterId
    });
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    if (!['draft', 'returned'].includes(article.status)) {
      return res.status(409).json({
        message: 'This article cannot be submitted in its current status'
      });
    }

    const input = validateArticleInput(article.workingVersion?.toObject(), true);
    if (input.error) {
      return res.status(400).json({ message: input.error });
    }

    // Only submit the exact revision whose publication fields were validated.
    const updated = await Article.findOneAndUpdate(
      {
        _id: article._id,
        reporter: reporterId,
        status: article.status,
        __v: article.__v
      },
      {
        $set: { status: 'pending', editorNote: '' },
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({
        message: 'Article changed while submitting. Review it and try again.'
      });
    }
    res.json({ message: 'Article submitted for editor approval' });
  } catch (error) {
    next(error);
  }
};
