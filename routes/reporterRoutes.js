const express = require('express');
const reporterController = require('../controllers/reporterController');

const { requireAuthentication, requireRole } = require('../middleware/authMiddleware');
const { respond } = require('../middleware/errorMiddleware');

const router = express.Router();

router.use(requireAuthentication, requireRole('reporter'));

// Reject malformed IDs before any controller sends them to Mongoose.
router.param('id', (req, res, next, id) => {
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    return respond(req, res, 400, 'Invalid article ID');
  }
  next();
});

router.get('/', reporterController.getDashboard);

router.get('/articles/new', reporterController.getNewArticle);

router.post('/articles', reporterController.createArticle);

router.get('/articles/:id/edit', reporterController.getEditArticle);

// Autosave sends only the changed fields of the article's working version.
router.patch('/articles/:id', reporterController.autosaveArticle);

// Submitting for approval changes the article's status to "pending".
router.patch('/articles/:id/status', reporterController.submitForReview);

module.exports = router;
