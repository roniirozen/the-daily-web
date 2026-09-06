const express = require('express');
const feedController = require('../controllers/feedController');

const router = express.Router();

// Integration: mount at /api/feed. Public endpoint - no auth required.
router.get('/', feedController.getFeed);
router.post('/', feedController.getFeed);
router.get('/categories', feedController.getCategories);

module.exports = router;
