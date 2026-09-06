const express = require('express');
const reporterController = require('../controllers/reporterController');

const { requireAuthentication, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(requireAuthentication, requireRole('reporter'));

// Reject malformed IDs before any controller sends them to Mongoose.
router.param('id', (req, res, next, id) => {
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    return res.status(400).json({ message: 'Invalid article ID' });
  }
  next();
});

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
