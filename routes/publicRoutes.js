const express = require('express');
const publicController = require('../controllers/publicController');

const router = express.Router();
router.get('/articles/:id', publicController.getArticle);

module.exports = router;
