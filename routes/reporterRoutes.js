const express = require('express');
const reporterController = require('../controllers/reporterController');

const { requireAuthentication, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(requireAuthentication, requireRole('reporter'));

router.get('/', reporterController.getDashboard);

router.get('/articles/new', reporterController.getNewArticle);

router.post('/articles', reporterController.createArticle);

router.get('/articles/:id/edit', reporterController.getEditArticle);

router.patch(
  '/articles/:id/autosave',
  reporterController.autosaveArticle
);

router.post(
  '/articles/:id/submit',
  reporterController.submitForReview
);

module.exports = router;

