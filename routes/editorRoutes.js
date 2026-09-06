const express = require('express');
const editorController = require('../controllers/editorController');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Integration: mount at /editor AFTER loadCurrentUser and body parsing.
// Identity and role come only from the existing server-loaded user.
router.use(requireRole('editor'));

router.get('/', editorController.getDashboard);
router.get('/articles/:id', editorController.getReviewArticle);
// POST actions support ordinary EJS forms without a method-override package.
router.post('/articles/:id/edit', editorController.editArticle);
router.post('/articles/:id/approve', editorController.approveArticle);
router.post('/articles/:id/return', editorController.returnArticle);
router.post('/articles/:id/delete', editorController.deleteArticle);

module.exports = router;
