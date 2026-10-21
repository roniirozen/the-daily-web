const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const logger = require('../utils/logger');
const { validateArticleInput } = require('../utils/articleValidation');
const { escapeRegex } = require('../utils/escapeRegex');
const { respond } = require('../middleware/errorMiddleware');
const { canChangeStatus } = require('../utils/articleWorkflow');

const statuses = ['draft', 'pending', 'published', 'returned'];
const fields = ['title', 'summary', 'content', 'imageUrl', 'category'];

function validateVersion(version) {
  return validateArticleInput(version?.toObject ? version.toObject() : version, true).error || null;
}

function handleError(error, req, res, next) {
  if (error.name === 'DocumentNotFoundError' || error.name === 'VersionError') {
    return respond(req, res, 409, 'This article changed during your action. Reload and try again.');
  }
  if (error.name === 'ValidationError') {
    return respond(req, res, 400, 'Invalid article data. Check the fields and try again.');
  }
  return next(error);
}

async function findArticle(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    respond(req, res, 400, 'Invalid article ID.');
    return null;
  }
  const article = await Article.findById(req.params.id).populate('reporter', 'username');
  if (!article) respond(req, res, 404, 'Article not found.');
  return article;
}

function prepareRevisionSave(article, req, res) {
  if (req.body?.revision !== article.updatedAt.toISOString()) {
    respond(req, res, 409, 'This review is out of date. Reload the article and try again.');
    return false;
  }
  // Mongoose includes this condition in save's update: only one competing
  // action can succeed, even if both requests read the same revision.
  article.$where = { status: article.status, updatedAt: article.updatedAt };
  return true;
}

function prepareStatusChange(article, nextStatus, req, res) {
  if (!canChangeStatus(article.status, nextStatus, 'editor')) {
    respond(req, res, 409, 'Only articles awaiting approval can be approved or returned.');
    return false;
  }
  return prepareRevisionSave(article, req, res);
}

exports.getDashboard = async (req, res, next) => {
  try {
    const status = req.query.status ?? '';
    if (typeof status !== 'string' || (status && !statuses.includes(status))) {
      return respond(req, res, 400, 'Invalid article status filter.');
    }
    const pageValue = req.query.page ?? '1';
    const search = req.query.search ?? '';
    if (typeof pageValue !== 'string' || !/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(Number(pageValue)) ||
        typeof search !== 'string' || search.length > 200) {
      return respond(req, res, 400, 'Invalid article search or page.');
    }
    const filter = status ? { status } : {};
    if (search.trim()) filter['workingVersion.title'] = { $regex: escapeRegex(search.trim()), $options: 'i' };
    const total = await Article.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / 20));
    const page = Math.min(Number(pageValue), totalPages);
    const articles = await Article.find(filter)
      .select('workingVersion.title workingVersion.category publishedVersion.title reporter status updatedAt')
      .populate('reporter', 'username').sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * 20).limit(20).lean();
    // An Ajax request (public/js/listResults.js) receives only the results.
    res.vary('X-Requested-With');
    return res.render(req.xhr ? 'editor/partials/article-results' : 'editor/dashboard', {
      pageTitle: 'Editor Dashboard', articles, statuses, selectedStatus: status, total, page, totalPages, search
    });
  } catch (error) { return handleError(error, req, res, next); }
};

exports.getReviewArticle = async (req, res, next) => {
  try {
    const article = await findArticle(req, res);
    if (!article) return;
    return res.render('editor/review-article', { pageTitle: 'Review Article', article });
  } catch (error) { return handleError(error, req, res, next); }
};

// Editors may edit any article. Editing a published article creates a
// pending update, so the public snapshot changes only after approval.
exports.editArticle = async (req, res, next) => {
  try {
    const article = await findArticle(req, res);
    if (!article || !prepareRevisionSave(article, req, res)) return;
    const input = validateArticleInput(Object.fromEntries(fields.map(field => [field, req.body?.[field] ?? ''])), true);
    if (input.error) return respond(req, res, 400, input.error);
    // Browsers submit textarea line breaks as CRLF; store them like autosave does.
    const version = { ...input.fields, content: input.fields.content.replace(/\r\n?/g, '\n') };
    const changed = fields.some(field => version[field] !== (article.publishedVersion?.[field] || ''));
    article.workingVersion = version;
    if (changed && canChangeStatus(article.status, 'pending', 'editor')) article.status = 'pending';
    await article.save();
    logger.info('Editor saved article', { userId: req.currentUser._id.toString(), method: 'PATCH', route: '/editor/articles/:id' });
    return res.redirect(303, `/editor/articles/${article._id}`);
  } catch (error) { return handleError(error, req, res, next); }
};

async function approveArticle(req, res, next) {
  try {
    const article = await findArticle(req, res);
    if (!article || !prepareStatusChange(article, 'published', req, res)) return;
    const message = validateVersion(article.workingVersion);
    if (message) return respond(req, res, 400, message);
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
    logger.info('Editor approved publication', { userId: req.currentUser._id.toString(), method: 'PATCH', route: '/editor/articles/:id/status' });
    return res.redirect(303, `/editor/articles/${article._id}`);
  } catch (error) { return handleError(error, req, res, next); }
}

async function returnArticle(req, res, next) {
  try {
    const article = await findArticle(req, res);
    if (!article || !prepareStatusChange(article, 'returned', req, res)) return;
    const note = req.body?.editorNote;
    if (typeof note !== 'string' || !note.trim() || note.length > 2000) {
      return respond(req, res, 400, 'An editor note of at most 2000 characters is required.');
    }
    article.editorNote = note.trim();
    article.status = 'returned';
    await article.save();
    logger.info('Editor returned article', { userId: req.currentUser._id.toString(), method: 'PATCH', route: '/editor/articles/:id/status' });
    return res.redirect(303, `/editor/articles/${article._id}`);
  } catch (error) { return handleError(error, req, res, next); }
}

// The status is a field of the article resource; the requested new status
// selects the editorial decision.
exports.changeStatus = (req, res, next) => {
  if (req.body?.status === 'published') return approveArticle(req, res, next);
  if (req.body?.status === 'returned') return returnArticle(req, res, next);
  return respond(req, res, 400, 'Choose a status of published or returned.');
};

exports.deleteArticle = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return respond(req, res, 400, 'Invalid article ID.');
    }
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return respond(req, res, 404, 'Article not found.');
    await Promise.all([Comment.deleteMany({ article: article._id }), ViewStat.deleteMany({ article: article._id })]);
    logger.info('Editor deleted article', { userId: req.currentUser._id.toString(), method: 'DELETE', route: '/editor/articles/:id' });
    return res.redirect(303, '/editor');
  } catch (error) { return handleError(error, req, res, next); }
};
