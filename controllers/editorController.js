const mongoose = require('mongoose');
const Article = require('../models/Article');
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
    const articles = await Article.find(status ? { status } : {})
      .populate('reporter', 'username').sort({ updatedAt: -1 });
    return res.render('editor/dashboard', {
      pageTitle: 'Editor Dashboard', articles, statuses, selectedStatus: status
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
    return res.redirect(303, `/editor/articles/${article._id}`);
  } catch (error) { return handleError(error, res, next); }
};

exports.returnArticle = async (req, res, next) => {
  try {
    const article = await findArticle(req, res);
    if (!article || !prepareReviewSave(article, req, res)) return;
    const note = req.body?.editorNote;
    if (typeof note !== 'string' || !note.trim()) {
      return res.status(400).send('An editor note is required when returning an article.');
    }
    article.editorNote = note.trim();
    article.status = 'returned';
    await article.save();
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
    return res.redirect(303, '/editor');
  } catch (error) { return handleError(error, res, next); }
};
