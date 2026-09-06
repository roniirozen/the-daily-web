const mongoose = require('mongoose');
const Article = require('../models/Article');
const stats = require('../services/viewStatsService');
const logger = require('../utils/logger');

// The containing analytics router requires a database-backed Editor role.
function action(operation) {
  return async (req, res, next) => {
    try {
      if (!mongoose.isObjectIdOrHexString(req.params.id) ||
          (req.params.statId && !mongoose.isObjectIdOrHexString(req.params.statId))) {
        return res.status(400).json({ message: 'Invalid statistics or article ID.' });
      }
      if (!await Article.exists({ _id: req.params.id })) return res.status(404).json({ message: 'Article not found.' });
      if (req.params.statId) {
        const record = await stats.getViewStatById(req.params.statId);
        if (!record || String(record.article) !== req.params.id) return res.status(404).json({ message: 'View statistics not found.' });
      }
      await operation(req, res);
    } catch (error) { next(error); }
  };
}

exports.list = action(async (req, res) => {
  const rawPage = req.query.page ?? '1';
  if (typeof rawPage !== 'string' || !/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage))) {
    return res.status(400).json({ message: 'Invalid statistics page.' });
  }
  const records = await stats.listViewStats({ article: req.params.id, limit: 50, skip: (Number(rawPage) - 1) * 50 });
  res.json({ records, page: Number(rawPage) });
});
exports.get = action(async (req, res) => res.json({ record: await stats.getViewStatById(req.params.statId) }));
exports.create = action(async (req, res) => {
  const record = await stats.createViewStat({ article: req.params.id, bucketStart: req.body?.bucketStart, viewCount: req.body?.viewCount });
  logger.info('Editor created view statistics', { userId: req.currentUser._id.toString() });
  res.status(201).json({ record });
});
exports.update = action(async (req, res) => {
  const record = await stats.updateViewStat(req.params.statId, { viewCount: req.body?.viewCount });
  if (!record) return res.status(404).json({ message: 'View statistics not found.' });
  logger.info('Editor updated view statistics', { userId: req.currentUser._id.toString() });
  res.json({ record });
});
exports.remove = action(async (req, res) => {
  const record = await stats.deleteViewStat(req.params.statId);
  if (!record) return res.status(404).json({ message: 'View statistics not found.' });
  logger.info('Editor deleted view statistics', { userId: req.currentUser._id.toString() });
  res.json({ message: 'View statistics deleted.' });
});
