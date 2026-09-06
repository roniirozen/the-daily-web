const express = require('express');
const commentsController = require('../controllers/commentsController');
const publicController = require('../controllers/publicController');

const router = express.Router();

router.get('/articles/:id', publicController.getArticle);

router.get(
  '/api/articles/:articleId/comments',
  commentsController.getArticleComments
);
router.post(
  '/api/articles/:articleId/comments',
  commentsController.createComment
);
router.patch(
  '/api/comments/:commentId',
  commentsController.requireEditor,
  commentsController.updateComment
);
router.delete(
  '/api/comments/:commentId',
  commentsController.requireEditor,
  commentsController.deleteComment
);

module.exports = router;
