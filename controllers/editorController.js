const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const logger = require('../utils/logger');
const { validateArticleInput } = require('../utils/articleValidation');

const statuses = ['draft', 'pending', 'published', 'returned'];
const fields = ['title', 'summary', 'content', 'imageUrl', 'category'];

function validateVersion(version) {
  return validateArticleInput(version?.toObject ? version.toObject() : version, true).error || null;
}

function handleError(error, res, next) {
  if (error.name === 'DocumentNotFoundError' || error.name === 'VersionError') {
    return res.status(409).send('This article changed during your action. Reload and try again.');
  }
  if (error.name === 'ValidationError') {
    return res.status(400).send('Invalid article data. Check the fields and try again.');
  }
  return next(error);
}

async function findArticle(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    res.status(400).send('Invalid article ID.');
    return null;
  }
  const article = await Article.findById(req.params.id).populate('reporter', 'username');
  if (!article) res.status(404).send('Article not found.');
  return article;
}

function prepareReviewSave(article, req, res) {
  if (article.status !== 'pending') {
    res.status(409).send('Only pending articles can be edited, approved or returned.');
    return false;
  }
  if (req.body?.revision !== article.updatedAt.toISOString()) {
    res.status(409).send('This review is out of date. Reload the article and try again.');
    return false;
  }
  // Mongoose includes this condition in save's update: only one competing
  // review action can succeed, even if both requests read the pending state.
  article.$where = { status: 'pending', updatedAt: article.updatedAt };
  return true;
}

exports.getDashboard = async (req, res, next) => {
  try {
    const status = req.query.status ?? '';
    if (typeof status !== 'string' || (status && !statuses.includes(status))) {
      return res.status(400).send('Invalid article status filter.');
    }
    const pageValue = req.query.page ?? '1';
    const search = req.query.search ?? '';
    if (typeof pageValue !== 'string' || !/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(Number(pageValue)) ||
        typeof search !== 'string' || search.length > 200) {
      return res.status(400).send('Invalid article search or page.');
    }
    const filter = status ? { status } : {};
    if (search.trim()) filter['workingVersion.title'] = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const total = await Article.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / 20));
    const page = Math.min(Number(pageValue), totalPages);
    const articles = await Article.find(filter)
      .select('workingVersion.title workingVersion.category publishedVersion.title reporter status updatedAt')
      .populate('reporter', 'username').sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * 20).limit(20).lean();
    return res.render('editor/dashboard', {
      pageTitle: 'Editor Dashboard', articles, statuses, selectedStatus: status, total, page, totalPages, search
    });
  } catch (error) { return handleError(error, res, next); }
};

exports.getReviewArticle = async (req, res, next) => {
  try {
    const article = await findArticle(req, res);
    if (!article) return;
    return res.render('editor/review-article', { pageTitle: 'Review Article', article });
  } catch (error) { return handleError(error, res, next); }
};

exports.editArticle = async (req, res, next) => {
  try {
    const article = await findArticle(req, res);
    if (!article || !prepareReviewSave(article, req, res)) return;
    const version = Object.fromEntries(fields.map(field => [field, req.body?.[field] ?? '']));
    const message = validateVersion(version);
    if (message) return res.status(400).send(message);
    article.workingVersion = version;
    await article.save();
    logger.info('Editor saved submitted article', { userId: req.currentUser._id.toString(), route: '/editor/articles/:id/edit' });
    return res.redirect(303, `/editor/articles/${article._id}`);
  } catch (error) { return handleError(error, res, next); }
};

exports.approveArticle = async (req, res, next) => {
  try {
    const article = await findArticle(req, res);
    if (!article || !prepareReviewSave(article, req, res)) return;
    const message = validateVersion(article.workingVersion);
    if (message) return res.status(400).send(message);
    const approvedAt = new Date();
    const type = article.publishedVersion ? 'update' : 'initial';
    // Copy primitive fields, never share the mutable working subdocument.
    article.publishedVersion = Object.fromEntries(
      fields.map(field => [field, article.workingVersion[field]])
    );
    article.status = 'published';
    article.editorNote = '';
    // publishedAt means the latest approval; history retains every approval.
    article.publishedAt = approvedAt;
    article.publicationHistory.push({ approvedAt, editor: req.currentUser._id, type });
    await article.save();
    logger.info('Editor approved publication', { userId: req.currentUser._id.toString(), route: '/editor/articles/:id/approve' });
    return res.redirect(303, `/editor/articles/${article._id}`);
  } catch (error) { return handleError(error, res, next); }
};

exports.returnArticle = async (req, res, next) => {
  try {
    const article = await findArticle(req, res);
    if (!article || !prepareReviewSave(article, req, res)) return;
    const note = req.body?.editorNote;
    if (typeof note !== 'string' || !note.trim() || note.length > 2000) {
      return res.status(400).send('An editor note of at most 2000 characters is required.');
    }
    article.editorNote = note.trim();
    article.status = 'returned';
    await article.save();
    logger.info('Editor returned article', { userId: req.currentUser._id.toString(), route: '/editor/articles/:id/return' });
    return res.redirect(303, `/editor/articles/${article._id}`);
  } catch (error) { return handleError(error, res, next); }
};

exports.deleteArticle = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).send('Invalid article ID.');
    }
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).send('Article not found.');
    await Promise.all([Comment.deleteMany({ article: article._id }), ViewStat.deleteMany({ article: article._id })]);
    logger.info('Editor deleted article', { userId: req.currentUser._id.toString(), route: '/editor/articles/:id/delete' });
    return res.redirect(303, '/editor');
  } catch (error) { return handleError(error, res, next); }
};
