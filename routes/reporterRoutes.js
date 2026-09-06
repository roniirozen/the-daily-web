const express = require('express');
const reporterController = require('../controllers/reporterController');

const router = express.Router();

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
